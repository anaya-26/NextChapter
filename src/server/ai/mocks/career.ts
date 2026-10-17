import "server-only";
import { registerMockResponder } from "../mock-responders";

/** Simulated career review: the rule-based possibilities, labelled. */
registerMockResponder("career_review", (req) => {
  const draft = JSON.parse(/Rule-based draft: (\[[\s\S]*\])$/.exec(req.task)?.[1] ?? "[]") as { title: string }[];
  return {
    summary: "(Simulated AI) A few directions worth exploring, based on what you’ve done so far.",
    possibilities: draft,
    limitations: ["(Simulated AI) This review was produced by a test double, not real AI."],
  };
});
