import "server-only";
import { Prisma, type Job } from "@/generated/prisma/client";
import { prisma } from "../db";

/**
 * Postgres-backed job queue. Workers claim jobs with FOR UPDATE SKIP LOCKED so several
 * worker processes can run safely. Progress and errors are stored on the row so the UI
 * can show processing status.
 */

export type EnqueueOptions = {
  userId?: string;
  runAt?: Date;
  maxAttempts?: number;
  /** Prevents duplicate queued jobs for the same work. */
  dedupeKey?: string;
};

export async function enqueueJob(type: string, payload: Prisma.InputJsonValue, opts: EnqueueOptions = {}) {
  if (opts.dedupeKey) {
    const existing = await prisma.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing && (existing.status === "QUEUED" || existing.status === "RUNNING")) return existing;
    if (existing) await prisma.job.update({ where: { id: existing.id }, data: { dedupeKey: null } });
  }
  return prisma.job.create({
    data: {
      type,
      payload,
      userId: opts.userId,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
      dedupeKey: opts.dedupeKey,
    },
  });
}

export async function claimNextJob(workerId: string, types?: string[]): Promise<Job | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId},
      attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAt" <= NOW()
        ${types && types.length ? Prisma.sql`AND type IN (${Prisma.join(types)})` : Prisma.empty}
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  if (!rows.length) return null;
  return prisma.job.findUnique({ where: { id: rows[0].id } });
}

export async function reportProgress(jobId: string, progress: number, message?: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { progress: Math.max(0, Math.min(100, Math.round(progress))), message },
  });
}

export async function completeJob(jobId: string, result?: Prisma.InputJsonValue) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", progress: 100, result, finishedAt: new Date(), lockedAt: null },
  });
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = job.attempts < job.maxAttempts && !(error instanceof PermanentJobError);
  const backoffMs = Math.min(15 * 60_000, 2 ** job.attempts * 15_000);
  await prisma.job.update({
    where: { id: job.id },
    data: retry
      ? { status: "QUEUED", lastError: message, runAt: new Date(Date.now() + backoffMs), lockedAt: null, lockedBy: null }
      : { status: "FAILED", lastError: message, finishedAt: new Date(), lockedAt: null },
  });
  return retry;
}

/** Throw to fail a job without retrying (e.g. unsupported file, missing configuration). */
export class PermanentJobError extends Error {}

/** Requeue jobs whose worker died mid-run. */
export async function releaseStaleJobs(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const res = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null },
  });
  return res.count;
}
