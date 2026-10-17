/**
 * Optional in-process worker for single-instance deployments and local development.
 * Set RUN_WORKER_IN_PROCESS=true to process background jobs inside the Next.js server;
 * otherwise run `npm run worker` as a separate process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER_IN_PROCESS !== "true") return;
  await import("./server/jobs/register-all");
  const { startWorkerLoop } = await import("./server/jobs/runner");
  void startWorkerLoop();
}
