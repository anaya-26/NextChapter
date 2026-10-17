import "server-only";
import { hostname } from "node:os";
import type { Job } from "@/generated/prisma/client";
import { prisma } from "../db";
import { claimNextJob, completeJob, failJob, releaseStaleJobs, reportProgress } from "./queue";
import { jobHandlers } from "./handlers";

export type JobContext = {
  job: Job;
  progress: (pct: number, message?: string) => Promise<void>;
};

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<unknown>;

export const WORKER_HEARTBEAT = "worker";

export async function runJob(job: Job): Promise<"succeeded" | "retrying" | "failed"> {
  const handler = jobHandlers[job.type];
  if (!handler) {
    await failJob({ ...job, attempts: job.maxAttempts }, new Error(`No handler for job type "${job.type}"`));
    return "failed";
  }
  try {
    const result = await handler(job.payload, {
      job,
      progress: (pct, message) => reportProgress(job.id, pct, message),
    });
    await completeJob(job.id, (result ?? undefined) as never);
    return "succeeded";
  } catch (error) {
    const retrying = await failJob(job, error);
    if (process.env.NODE_ENV !== "test") console.error(`[jobs] ${job.type} ${job.id} failed:`, error);
    return retrying ? "retrying" : "failed";
  }
}

/** Process jobs until none are runnable. Used by tests and the inline fallback. */
export async function runJobsUntilIdle(opts: { workerId?: string; types?: string[]; maxJobs?: number } = {}) {
  const workerId = opts.workerId ?? `inline-${process.pid}`;
  let processed = 0;
  while (processed < (opts.maxJobs ?? 100)) {
    const job = await claimNextJob(workerId, opts.types);
    if (!job) break;
    await runJob(job);
    processed++;
  }
  return processed;
}

export async function beat(info: Record<string, unknown> = {}) {
  await prisma.systemHeartbeat.upsert({
    where: { name: WORKER_HEARTBEAT },
    create: { name: WORKER_HEARTBEAT, lastSeenAt: new Date(), info: info as never },
    update: { lastSeenAt: new Date(), info: info as never },
  });
}

/** Long-running poll loop (worker process or in-process when RUN_WORKER_IN_PROCESS=true). */
export async function startWorkerLoop(opts: { pollMs?: number; signal?: AbortSignal } = {}) {
  const workerId = `${hostname()}-${process.pid}`;
  const pollMs = opts.pollMs ?? 1500;
  let lastBeat = 0;
  let lastStaleCheck = 0;
  while (!opts.signal?.aborted) {
    try {
      const now = Date.now();
      if (now - lastBeat > 30_000) {
        await beat({ workerId });
        lastBeat = now;
      }
      if (now - lastStaleCheck > 5 * 60_000) {
        await releaseStaleJobs();
        lastStaleCheck = now;
      }
      const job = await claimNextJob(workerId);
      if (job) {
        await runJob(job);
        continue;
      }
    } catch (error) {
      console.error("[worker] loop error", error);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function workerStatus() {
  const hb = await prisma.systemHeartbeat.findUnique({ where: { name: WORKER_HEARTBEAT } });
  const alive = !!hb && Date.now() - hb.lastSeenAt.getTime() < 90_000;
  return { alive, lastSeenAt: hb?.lastSeenAt ?? null };
}
