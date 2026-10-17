import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { createSubject } from "@/server/services/subjects";
import { confirmSyllabus, createSyllabus, getRoadmap, getSyllabus, saveOutline, setTopicFamiliar, type Outline } from "@/server/services/syllabus";
import { xpSummary } from "@/server/services/xp";
import { createTestUser } from "../helpers/db";

const text = readFileSync("tests/fixtures/sample-syllabus.txt", "utf8");

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  resetEnvCache();
  resetAiProvider();
}

describe("syllabus intake → correction → roadmap", () => {
  beforeAll(() => useProvider("none"));

  it("extracts pasted text with rules, flags nothing it invented, and builds a roadmap after confirmation", async () => {
    const { id } = await createTestUser();
    const subject = await createSubject(id, { name: "Physics" });
    const { syllabus } = await createSyllabus(id, { subjectId: subject.id, title: "", files: [], pastedText: text });
    await runJobsUntilIdle({ types: ["syllabus.extract"] });

    const draft = await getSyllabus(id, syllabus.id);
    expect(draft?.status).toBe("NEEDS_REVIEW");
    expect(draft?.extractionMethod).toBe("RULES");
    expect(draft?.units).toHaveLength(4);
    expect(draft?.title).toMatch(/^PHYSICS — CLASS XII/);
    expect(draft?.units.some((u) => u.uncertain)).toBe(false);
    const allTopics = draft!.units.flatMap((u) => u.topics.map((t) => t.title));
    expect(allTopics).toContain("Kirchhoff's laws");
    // The original is kept and accessible.
    expect(draft?.sources[0].fileKey).toBeTruthy();
    expect(draft?.sources[0].status).toBe("READY");

    // Student corrections: rename a topic, delete one, add one, move one to another unit.
    const units: Outline["units"] = draft!.units.map((u) => ({
      id: u.id,
      title: u.title,
      topics: u.topics.map((t) => ({ id: t.id, title: t.title, kind: t.kind, uncertain: t.uncertain })),
    }));
    units[0].topics[0].title = "Electric charge and its properties";
    units[0].topics.splice(1, 1); // remove "Conservation of charge"
    units[2].topics.push({ id: null, title: "Meter bridge", kind: "REQUIRED", uncertain: false });
    const moved = units[3].topics.pop()!;
    units[2].topics.push(moved);
    await saveOutline(id, syllabus.id, { title: "Physics Class 12", units, assessment: [{ label: "Theory", detail: "70 marks", excerpt: null, uncertain: false }] });

    await confirmSyllabus(id, syllabus.id, new Date());
    await runJobsUntilIdle({ types: ["roadmap.enrich"] });

    const roadmap = await getRoadmap(id, subject.id);
    const confirmed = roadmap!.syllabi[0];
    expect(confirmed.status).toBe("CONFIRMED");
    const titles = confirmed.topics.map((t) => t.title);
    expect(titles).toContain("Electric charge and its properties");
    expect(titles).not.toContain("Conservation of charge");
    expect(titles).toContain("Meter bridge");
    expect(confirmed.topics.find((t) => t.title === "Meter bridge")?.origin).toBe("STUDENT");
    // Rule-based enrichment: effort + generic (labelled) objectives + in-unit sequence.
    const ohm = confirmed.topics.find((t) => t.title === "Ohm's law")!;
    expect(ohm.estimatedMinutes).toBe(90);
    expect(ohm.objectivesSource).toBe("RULES");
    expect(ohm.prerequisites.length).toBe(1);
    // No invented background or optional topics without AI.
    expect(confirmed.topics.every((t) => t.kind === "REQUIRED")).toBe(true);
    expect((await xpSummary(id)).total).toBe(20);
  });

  it("reads a PDF and a phone photo (on-device OCR) without AI", async () => {
    process.env.OCR_LOCAL_ENABLED = "true";
    resetEnvCache();
    const { id } = await createTestUser();
    const subject = await createSubject(id, { name: "Physics" });
    const { syllabus } = await createSyllabus(id, {
      subjectId: subject.id,
      title: "From files",
      files: [
        { fileName: "syllabus.pdf", mime: "application/pdf", data: readFileSync("tests/fixtures/sample-syllabus.pdf") },
        { fileName: "page1.png", mime: "image/png", data: readFileSync("tests/fixtures/sample-syllabus-photo.png") },
      ],
    });
    await runJobsUntilIdle({ types: ["syllabus.extract"] });
    const draft = await getSyllabus(id, syllabus.id);
    process.env.OCR_LOCAL_ENABLED = "false";
    resetEnvCache();
    expect(draft?.extractionMethod).toBe("OCR_RULES");
    expect(draft?.sources.map((s) => s.extractionMethod).sort()).toEqual(["local-ocr", "pdf-text"]);
    const topics = draft!.units.flatMap((u) => u.topics.map((t) => t.title.toLowerCase()));
    expect(topics).toContain("coulomb's law");
    expect(topics).toContain("wheatstone bridge");
  }, 60_000);

  it("uses the (labelled) mock AI for extraction and enrichment with background/optional topics", async () => {
    useProvider("mock");
    const { id } = await createTestUser();
    const subject = await createSubject(id, { name: "Physics" });
    const { syllabus } = await createSyllabus(id, { subjectId: subject.id, title: "", files: [], pastedText: text });
    await runJobsUntilIdle({ types: ["syllabus.extract"] });
    const draft = await getSyllabus(id, syllabus.id);
    expect(draft?.extractionMethod).toBe("MOCK");
    expect(draft?.extractionNotes[0]).toMatch(/Simulated AI/);
    await confirmSyllabus(id, syllabus.id, new Date());
    await runJobsUntilIdle({ types: ["roadmap.enrich"] });
    const roadmap = await getRoadmap(id, subject.id);
    const topics = roadmap!.syllabi[0].topics;
    const background = topics.filter((t) => t.kind === "BACKGROUND");
    expect(background).toHaveLength(1);
    expect(background[0].origin).toBe("MOCK");
    // The background topic is a prerequisite of the first syllabus topic and ordered before it.
    const first = topics.find((t) => t.prerequisites.some((p) => p.prerequisiteId === background[0].id))!;
    expect(background[0].order).toBeLessThan(first.order);
    expect(topics.filter((t) => t.kind === "OPTIONAL")).toHaveLength(1);
    useProvider("none");
  });

  it("keeps syllabi private and lets students skip familiar topics", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const subject = await createSubject(a.id, { name: "Chemistry" });
    const { syllabus } = await createSyllabus(a.id, { subjectId: subject.id, title: "", files: [], pastedText: "Unit 1: Atoms\nAtomic models; Quantum numbers" });
    await runJobsUntilIdle({ types: ["syllabus.extract"] });
    expect(await getSyllabus(b.id, syllabus.id)).toBeNull();
    expect(await getRoadmap(b.id, subject.id)).toBeNull();
    await expect(createSyllabus(b.id, { subjectId: subject.id, title: "", files: [], pastedText: "x" })).rejects.toThrow("Subject not found");
    const topic = await prisma.topic.findFirstOrThrow({ where: { syllabusId: syllabus.id } });
    expect(await setTopicFamiliar(b.id, topic.id, true)).toBe(false);
    expect(await setTopicFamiliar(a.id, topic.id, true)).toBe(true);
    expect((await prisma.topic.findUniqueOrThrow({ where: { id: topic.id } })).status).toBe("SKIPPED");
  });
});
