/** Small personal study experiments: try one change for a week or two and compare with before. */

export type ExperimentMetric = "session_completion" | "study_minutes" | "recall" | "practice_accuracy";

export const METRIC_LABELS: Record<ExperimentMetric, { label: string; unit: "percent" | "minutes"; better: "higher" }> = {
  session_completion: { label: "Planned sessions completed", unit: "percent", better: "higher" },
  study_minutes: { label: "Minutes studied per day", unit: "minutes", better: "higher" },
  recall: { label: "Recall at revision", unit: "percent", better: "higher" },
  practice_accuracy: { label: "Practice accuracy", unit: "percent", better: "higher" },
};

export type ExperimentTemplate = { id: string; title: string; hypothesis: string; change: string; metric: ExperimentMetric; days: number };

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  { id: "evening-sessions", title: "Evening instead of morning", hypothesis: "I finish more planned sessions in the evening.", change: "Plan study sessions in the evening for a week.", metric: "session_completion", days: 7 },
  { id: "short-sessions", title: "Shorter sessions", hypothesis: "25-minute sessions are easier to start and finish.", change: "Use 25-minute sessions with 5-minute breaks.", metric: "session_completion", days: 7 },
  { id: "phone-away", title: "Phone in another room", hypothesis: "I study longer without my phone nearby.", change: "Keep your phone in another room during every session.", metric: "study_minutes", days: 7 },
  { id: "recall-first", title: "Recall before re-reading", hypothesis: "Testing myself first helps me remember more.", change: "Start each revision by writing down what you remember, then check your notes.", metric: "recall", days: 14 },
  { id: "daily-questions", title: "Three questions a day", hypothesis: "A little practice every day improves my accuracy.", change: "Answer at least three practice questions every day.", metric: "practice_accuracy", days: 14 },
];

export function formatMetric(metric: ExperimentMetric, value: number | null) {
  if (value == null) return "—";
  return METRIC_LABELS[metric].unit === "percent" ? `${Math.round(value * 100)}%` : `${Math.round(value)} min`;
}

/** Honest comparison: small samples are called out rather than over-interpreted. */
export function compareMetric(metric: ExperimentMetric, before: { value: number | null; n: number }, after: { value: number | null; n: number }) {
  if (before.value == null || after.value == null) return { direction: "unknown" as const, note: "Not enough data to compare yet." };
  const diff = after.value - before.value;
  const threshold = METRIC_LABELS[metric].unit === "percent" ? 0.05 : 5;
  const small = before.n < 3 || after.n < 3;
  const direction = Math.abs(diff) < threshold ? ("same" as const) : diff > 0 ? ("up" as const) : ("down" as const);
  const note = small
    ? "Only a few data points — treat this as a hint, not proof."
    : direction === "same"
      ? "About the same as before."
      : direction === "up"
        ? "Better than before — though other things in your week may also have changed."
        : "Lower than before — that's useful to know too.";
  return { direction, note };
}
