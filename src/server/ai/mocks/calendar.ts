import "server-only";
import { registerMockResponder } from "../mock-responders";
import { parseScheduleText } from "@/lib/nl-schedule";

/** Simulated scheduling: the rules parser, so tests are deterministic. */
registerMockResponder("nl_schedule", (req) => {
  const at = new Date(/Reference: (\S+)/.exec(req.task)?.[1] ?? Date.now());
  const tz = /Timezone: (\S+)/.exec(req.task)?.[1] ?? "Asia/Kolkata";
  const text = /Student's sentence: ([\s\S]*)$/.exec(req.task)?.[1] ?? "";
  const draft = parseScheduleText(text, at, tz);
  if (!draft) return null;
  return { ...draft, assumptions: ["(Simulated AI) Read with the rules parser.", ...draft.assumptions] };
});
