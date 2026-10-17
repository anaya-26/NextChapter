/**
 * Background worker: processes uploads (text extraction, OCR, transcription), syllabus
 * extraction, lesson pre-generation, link checks, calendar sync, feeds and reminders.
 *
 *   npm run worker
 */
import "dotenv/config";
import "@/server/jobs/register-all";
import { startWorkerLoop } from "@/server/jobs/runner";

const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing current job…`);
    controller.abort();
  });
}

console.log("[worker] started");
await startWorkerLoop({ signal: controller.signal });
console.log("[worker] stopped");
process.exit(0);
