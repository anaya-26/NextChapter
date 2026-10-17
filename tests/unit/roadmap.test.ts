import { describe, expect, it } from "vitest";
import { nextStep, prerequisitesMet, type RoadmapTopic } from "@/lib/roadmap";

const t = (id: string, order: number, extra: Partial<RoadmapTopic> = {}): RoadmapTopic => ({
  id,
  title: id,
  kind: "REQUIRED",
  status: "NOT_STARTED",
  order,
  studiedAt: null,
  prerequisiteIds: [],
  ...extra,
});

describe("roadmap next step", () => {
  it("follows the suggested order and skips completed or familiar topics", () => {
    const topics = [t("a", 1, { status: "STUDIED" }), t("b", 2, { status: "SKIPPED" }), t("c", 3), t("d", 4)];
    expect(nextStep(topics)?.topic.id).toBe("c");
  });

  it("revisits an unfinished foundation before the topic that needs it", () => {
    const topics = [t("bg", 5, { kind: "BACKGROUND" }), t("c", 1, { prerequisiteIds: ["bg"] }), t("d", 2)];
    const step = nextStep(topics);
    expect(step?.topic.id).toBe("bg");
    expect(step?.reason).toBe("Needed before “c”");
  });

  it("never pushes optional exploration as the next step", () => {
    expect(nextStep([t("x", 1, { kind: "OPTIONAL" })])).toBeNull();
  });

  it("checks prerequisites", () => {
    const all = [t("a", 1, { studiedAt: new Date() }), t("b", 2, { prerequisiteIds: ["a"] }), t("c", 3, { prerequisiteIds: ["b"] })];
    expect(prerequisitesMet(all[1], all)).toBe(true);
    expect(prerequisitesMet(all[2], all)).toBe(false);
  });
});
