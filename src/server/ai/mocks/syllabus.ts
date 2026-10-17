import "server-only";
import { estimateMinutes, parseSyllabusText } from "@/lib/syllabus/rules";
import { registerMockResponder } from "../mock-responders";

/** Simulated syllabus extraction: the rule-based parser, labelled as simulated. */
registerMockResponder("syllabus_extract", (req) => {
  const text = (req.references ?? []).map((r) => r.text).join("\n");
  const parsed = parseSyllabusText(text);
  return { ...parsed, warnings: ["Simulated AI: this structure was produced by the rule-based parser for testing.", ...parsed.warnings] };
});

/** Simulated roadmap enrichment derived deterministically from the topic listing. */
registerMockResponder("roadmap_enrich", (req) => {
  const rows = req.task
    .split("\n")
    .map((l) => l.split(" | "))
    .filter((p) => p.length === 3 && /^\w{10,}$/.test(p[0].trim()))
    .map(([id, unit, title]) => ({ id: id.trim(), unit, title: title.trim() }));
  return {
    topics: rows.map((r, i) => ({
      topicId: r.id,
      objectives: [`Explain ${r.title} clearly with an example`, `Solve two standard questions on ${r.title}`],
      estimatedMinutes: estimateMinutes(r.title),
      prerequisiteTopicIds: i > 0 && rows[i - 1].unit === r.unit ? [rows[i - 1].id] : [],
      prerequisiteReason: i > 0 && rows[i - 1].unit === r.unit ? "Builds on the previous topic in this unit (simulated)" : null,
    })),
    suggestedOrder: rows.map((r) => r.id),
    background: rows.length
      ? [{ title: `Foundations for ${rows[0].title} (simulated)`, why: "Simulated background suggestion for testing.", supportsTopicIds: [rows[0].id], estimatedMinutes: 30 }]
      : [],
    optional: rows.length
      ? [{ title: `Real-world applications of ${rows[rows.length - 1].title} (simulated)`, why: "Simulated exploration suggestion.", relatedTopicIds: [rows[rows.length - 1].id], estimatedMinutes: 30 }]
      : [],
  };
});
