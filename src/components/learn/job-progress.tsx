"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/feedback";

type JobState = { status: string; progress: number; message: string | null; lastError: string | null; attempts: number; maxAttempts: number };

/** Polls a background job and refreshes the page when it finishes. */
export function JobProgress({ jobId, label, intervalMs = 1500 }: { jobId: string; label: string; intervalMs?: number }) {
  const router = useRouter();
  const [job, setJob] = useState<JobState | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (res.status === 404) {
          setGone(true);
          return;
        }
        const data = (await res.json()) as JobState;
        if (cancelled) return;
        setJob(data);
        if (data.status === "SUCCEEDED" || data.status === "FAILED") {
          router.refresh();
          return;
        }
      } catch {
        // Network hiccup: keep polling.
      }
      timer = setTimeout(poll, intervalMs);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, intervalMs, router]);

  if (gone) return null;
  const failedOnce = job?.lastError && job.status === "QUEUED";
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        <span className="font-medium">{label}</span>
        {job?.message ? <span className="text-muted">— {job.message}</span> : null}
      </div>
      <Progress value={job?.progress ?? 5} label={label} />
      {job?.status === "QUEUED" && !failedOnce ? <p className="text-xs text-muted">Waiting for the background worker…</p> : null}
      {failedOnce ? (
        <p className="text-xs text-warning">
          A problem occurred ({job?.lastError}); retrying automatically (attempt {job?.attempts} of {job?.maxAttempts}).
        </p>
      ) : null}
    </div>
  );
}
