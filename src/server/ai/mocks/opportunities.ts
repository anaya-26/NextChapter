import "server-only";
import { registerMockResponder } from "../mock-responders";

/** Simulated opportunity reading: the rule-based reading, passed through. */
registerMockResponder("opportunity_extract", (req) => {
  const rules = JSON.parse(/Rule-based reading for reference: (\{[\s\S]*\})$/.exec(req.task)?.[1] ?? "{}") as Record<string, unknown>;
  return {
    title: rules.title ?? null,
    organisation: rules.organisation ?? null,
    kind: rules.kind ?? "OTHER",
    eligibility: rules.eligibility ?? null,
    educationRequirements: rules.educationRequirements ?? null,
    location: rules.location ?? null,
    workMode: rules.workMode ?? "UNKNOWN",
    duration: rules.duration ?? null,
    compensation: rules.compensation ?? null,
    deadline: rules.deadlineKey ?? null,
    requirements: rules.requirements ?? [],
  };
});

/** Simulated gap analysis: the rule-based rows, labelled. */
registerMockResponder("gap_analysis", (req) => {
  const draft = JSON.parse(/Rule-based draft: (\[[\s\S]*\])$/.exec(req.task)?.[1] ?? "[]") as { requirement: string; state: string; explanation: string; achievementIds: string[] }[];
  return { rows: draft.map((r) => ({ ...r, explanation: `(Simulated AI) ${r.explanation}` })) };
});

registerMockResponder("interview_feedback", () => ({
  strengths: ["(Simulated AI) You answered the question directly.", "(Simulated AI) You described your own part."],
  improvements: ["(Simulated AI) Finish with the result — what changed because of what you did?", "(Simulated AI) Add one concrete detail an interviewer could ask about."],
  star: { situation: true, task: true, action: true, result: false },
  followUp: "(Simulated AI) What would you do differently next time?",
}));

/** Simulated tailoring: rephrases each achievement's first sentence without adding facts. */
registerMockResponder("cv_tailor", (req) => ({
  suggestions: (req.references ?? []).slice(0, 3).map((r) => {
    const first = r.text.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]$/, "");
    return { achievementId: r.id, bullet: `${first} (simulated rewording)`, reason: "(Simulated AI) Puts the most relevant part first." };
  }),
  notes: ["(Simulated AI) Suggestions only use facts already in your achievements."],
}));
