import "server-only";
import { registerMockResponder } from "../mock-responders";

const line = (text: string, label: string) => new RegExp(`${label}:\\s*(.+)`).exec(text)?.[1]?.trim() ?? null;

/** Simulated memory extraction: only restates what the entry literally says. */
registerMockResponder("memory_extract", (req) => {
  const text = (req.references ?? []).map((r) => r.text).join("\n");
  const memories = [];
  const hard = line(text, "Difficult");
  if (hard) memories.push({ content: `(Simulated) Finds this difficult: ${hard}`.slice(0, 200), kind: "DIFFICULTY", evidence: hard });
  const time = /\b(morning|evening|night|afternoon)\b/i.exec(text)?.[1];
  if (time) memories.push({ content: `(Simulated) Mentions studying in the ${time.toLowerCase()}`, kind: "PREFERENCE", evidence: time });
  return { memories };
});

registerMockResponder("journal_suggestions", (req) => {
  const text = (req.references ?? []).map((r) => r.text).join("\n");
  const topic = line(text, "Topics")?.split(",")[0]?.trim() ?? null;
  return {
    suggestions: topic
      ? [{ title: `(Simulated) Practise ${topic}`, reason: "You wrote about it today.", type: "PRACTICE_TOPIC", topicTitle: topic }]
      : [{ title: "(Simulated) Plan tomorrow", reason: "A small plan makes starting easier.", type: "PLAN_WEEK", topicTitle: null }],
  };
});

/** Simulated weekly review: the app's rule-based draft, labelled. */
registerMockResponder("weekly_review", (req) => {
  const draft = JSON.parse(/Rule-based draft: (\{[\s\S]*\})$/.exec(req.task)?.[1] ?? "{}");
  return {
    highlights: draft.highlights ?? [],
    patterns: draft.patterns ?? [],
    difficulties: draft.difficulties ?? [],
    suggestions: (draft.suggestions ?? []).map((s: { title: string; reason: string; type: string; topicTitle: string | null }) => ({ title: s.title, reason: s.reason, type: s.type, topicTitle: s.topicTitle })),
    encouragement: `(Simulated AI) ${draft.encouragement ?? "Keep going."}`,
  };
});
