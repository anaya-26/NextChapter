import "server-only";
import { registerMockResponder } from "../mock-responders";
import type { TextRequest } from "../types";

/** Simulated companion: short, deterministic replies that exercise the action protocol. */
registerMockResponder("companion_chat_text", (req) => {
  const r = req as unknown as TextRequest;
  const last = [...r.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const said = (/Student's message:\n([\s\S]*)$/.exec(last)?.[1] ?? last).trim();
  const lower = said.toLowerCase();
  const topicLine = /\[CURRENT PRIORITY\] ([^(|]+)/.exec(last)?.[1]?.trim();
  if (/quiz|practi[cs]e|test me/.test(lower)) {
    return `(Simulated AI) Let's check what's sticking. Try a quick practice set, then look at any mistakes together.\n<actions>[{"type":"REVIEW_FLASHCARDS","label":"Review flashcards"},{"type":"REVIEW_MISTAKES","label":"Open my mistake library"}]</actions>`;
  }
  if (/behind|catch up|restart|missed/.test(lower)) {
    return `(Simulated AI) Falling behind happens. Let's not chase everything — pick one small session today and let the planner spread the rest.\n<actions>[{"type":"RESTART_PLAN","label":"See fresh-start options"},{"type":"START_FOCUS","label":"Start 25 minutes now","minutes":25}]</actions>`;
  }
  if (/plan|schedule|week/.test(lower)) {
    return `(Simulated AI) A plan that fits around your classes makes starting easier. I can book a session for tomorrow evening, or you can plan the whole week.\n<actions>[{"type":"SCHEDULE_STUDY","label":"Book 45 minutes tomorrow at 7 pm","title":"Study session","when":"tomorrow","time":"19:00","minutes":45},{"type":"PLAN_WEEK","label":"Plan my week"}]</actions>`;
  }
  return `(Simulated AI) You said: “${said.slice(0, 120)}” ${topicLine ? `Since your current priority is ${topicLine}, a good` : "A good"} next step is a short focused session on what feels hardest right now.\n<actions>[{"type":"START_FOCUS","label":"Start a 25-minute focus session","minutes":25}]</actions>`;
});
