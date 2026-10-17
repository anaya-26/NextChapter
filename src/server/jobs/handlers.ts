import "server-only";
import type { JobHandler } from "./runner";

/**
 * Registry of background job handlers, keyed by job type.
 * Each feature module registers its handlers here.
 */
export const jobHandlers: Record<string, JobHandler> = {};

export function registerJobHandler(type: string, handler: JobHandler) {
  jobHandlers[type] = handler;
}
