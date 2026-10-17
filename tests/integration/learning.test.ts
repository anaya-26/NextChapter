import { beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { getOwnedFile } from "@/server/storage";
import { createSubject } from "@/server/services/subjects";
import { confirmSyllabus, createSyllabus } from "@/server/services/syllabus";
import { addMaterials, deleteMaterial, passagesForTopic, searchPassages } from "@/server/services/sources";
import { buildCitedMarkdown, requestLesson } from "@/server/services/lessons";
import { evaluateUnderstanding, generatePracticeSet, gradeAttempt } from "@/server/services/practice";
import { addMistakeFromAttempt } from "@/server/services/mistakes";
import { createNote, updateNote } from "@/server/services/notes";
import { dueCards, exportCardsTsv, generateCardsFromNote, isStale, reviewCard } from "@/server/services/flashcards";
import { completeRevision, markStudied, scheduleRevision } from "@/server/services/revision";
import { addOwnResource, discoverResources } from "@/server/services/resources";
import { createTestUser } from "../helpers/db";

const SYLLABUS = `PHYSICS — CLASS XII
Unit II: Current Electricity
Chapter 3: Current Electricity — Ohm's law; Kirchhoff's laws; Wheatstone bridge.
Unit III: Magnetism
Chapter 4: Moving Charges — Moving coil galvanometer.`;

const NOTES = `Current electricity notes.

Ohm's law states that the current through a conductor is directly proportional to the potential difference across it, provided temperature and other physical conditions stay the same. In symbols, V = IR, where R is the resistance of the conductor. A graph of V against I for an ohmic conductor is a straight line through the origin, and its slope gives the resistance. Ohm's law does not hold for diodes or for a filament lamp whose temperature changes a lot. When using Ohm's law in a circuit, always check that the units are volts, amperes and ohms before substituting values.`;

const CAPTIONS = `WEBVTT

00:00:00.000 --> 00:00:05.000
Welcome to today's lecture on circuits.

00:00:05.000 --> 00:00:12.000
Kirchhoff's laws help us analyse circuits that cannot be reduced to simple series and parallel parts.

00:00:12.000 --> 00:00:20.000
The junction law says the total current entering a junction equals the total current leaving it.
`;

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  process.env.AI_WEB_SEARCH_ENABLED = "true";
  resetEnvCache();
  resetAiProvider();
}

async function studentWithRoadmap() {
  const { id } = await createTestUser();
  const subject = await createSubject(id, { name: "Physics" });
  const { syllabus } = await createSyllabus(id, { subjectId: subject.id, title: "", files: [], pastedText: SYLLABUS });
  await runJobsUntilIdle({ types: ["syllabus.extract"] });
  await confirmSyllabus(id, syllabus.id, new Date());
  await runJobsUntilIdle({ types: ["roadmap.enrich"] });
  const topics = await prisma.topic.findMany({ where: { userId: id, syllabusId: syllabus.id }, orderBy: { order: "asc" } });
  const topic = (title: string) => {
    const t = topics.find((x) => x.title === title);
    if (!t) throw new Error(`No topic ${title} in ${topics.map((x) => x.title).join(", ")}`);
    return t;
  };
  return { userId: id, subject, topic };
}

async function xpFor(userId: string, action: string) {
  const events = await prisma.xpEvent.findMany({ where: { userId, action: action as never } });
  return { count: events.length, points: events.reduce((s, e) => s + e.points, 0) };
}

describe("topic workspace: materials → coverage → cited lesson", () => {
  beforeAll(() => useProvider("mock"));

  it("processes notes and a captioned recording, estimates coverage and cites passages with pages and timestamps", async () => {
    const { userId, subject, topic } = await studentWithRoadmap();
    const ids = await addMaterials(userId, subject.id, [
      { fileName: "current-notes.txt", mime: "text/plain", data: Buffer.from(NOTES) },
      { fileName: "lecture.mp4", mime: "video/mp4", data: Buffer.from("not really a video") },
      { fileName: "lecture.vtt", mime: "text/vtt", data: Buffer.from(CAPTIONS) },
    ]);
    expect(ids).toHaveLength(3);
    await runJobsUntilIdle({ types: ["source.process"] });

    const sources = await prisma.source.findMany({ where: { userId }, include: { _count: { select: { chunks: true } } } });
    const notes = sources.find((s) => s.fileName === "current-notes.txt")!;
    const video = sources.find((s) => s.fileName === "lecture.mp4")!;
    const captions = sources.find((s) => s.fileName === "lecture.vtt")!;
    expect(notes.status).toBe("READY");
    expect(notes._count.chunks).toBeGreaterThan(0);
    // Captions are paired with the recording by file name and become its timestamped transcript.
    expect(captions.captionsForId).toBe(video.id);
    expect(video.status).toBe("READY");
    expect(video.extractionMethod).toBe("captions");
    expect(video._count.chunks).toBeGreaterThan(0);

    const ohm = await prisma.topic.findUniqueOrThrow({ where: { id: topic("Ohm's law").id } });
    const galvanometer = await prisma.topic.findUniqueOrThrow({ where: { id: topic("Moving coil galvanometer").id } });
    expect(ohm.coverage).toBe("COVERED");
    expect(galvanometer.coverage).toBe("MISSING");

    const kirchhoff = await passagesForTopic(userId, topic("Kirchhoff's laws").id);
    const timed = kirchhoff.find((p) => p.sourceId === video.id);
    expect(timed?.startSec).not.toBeNull();

    // Lesson grounded in the student's notes, with traceable citations.
    await requestLesson(userId, ohm.id, "STANDARD");
    await runJobsUntilIdle({ types: ["lesson.generate"] });
    const lesson = await prisma.lesson.findFirstOrThrow({ where: { topicId: ohm.id, mode: "STANDARD" } });
    expect(lesson.generatedBy).toBe("MOCK");
    expect(lesson.groundedness).not.toBe("GENERAL_KNOWLEDGE");
    const citations = lesson.citations as { sourceId: string; citedText: string }[];
    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0].sourceId).toBe(notes.id);
    expect((lesson.content as { markdown: string }).markdown).toContain("[[1]]");
    expect((await prisma.topic.findUniqueOrThrow({ where: { id: ohm.id } })).status).toBe("IN_PROGRESS");

    // With nothing matching, the lesson says so and is labelled general knowledge.
    await requestLesson(userId, galvanometer.id, "SIMPLE");
    await runJobsUntilIdle({ types: ["lesson.generate"] });
    const general = await prisma.lesson.findFirstOrThrow({ where: { topicId: galvanometer.id } });
    expect(general.groundedness).toBe("GENERAL_KNOWLEDGE");
    expect(general.warnings.join(" ")).toMatch(/Not based on your materials/);
  });

  it("only counts a lesson as grounded when enough of it is cited", () => {
    const passage = { id: "p1", sourceId: "s1", sourceTitle: "Notes", sourceKind: "TEXT" as const, text: "Ohm's law: V = IR.", page: 3, startSec: null, endSec: null, rank: 1 };
    const grounded = buildCitedMarkdown(
      [
        { text: "Intro. ", passageIds: [], citedTexts: [] },
        { text: "Voltage equals current times resistance.", passageIds: ["p1"], citedTexts: ["V = IR"] },
      ],
      [passage],
    );
    expect(grounded.groundedness).toBe("GROUNDED");
    expect(grounded.markdown).toBe("Intro. Voltage equals current times resistance. [[1]]");
    expect(grounded.citations[0]).toMatchObject({ n: 1, page: 3, citedText: "V = IR" });
    // A citation to an unknown passage is dropped rather than invented.
    const general = buildCitedMarkdown([{ text: "Something long and unsupported by any passage at all.", passageIds: ["nope"], citedTexts: ["x"] }], [passage]);
    expect(general.groundedness).toBe("GENERAL_KNOWLEDGE");
    expect(general.citations).toHaveLength(0);
  });
});

describe("practice, mistakes and understanding checks", () => {
  beforeAll(() => useProvider("mock"));

  it("grades deterministically, gives AI feedback on open answers, links mistakes and awards XP once", async () => {
    const { userId, topic } = await studentWithRoadmap();
    const ohm = topic("Ohm's law");
    const set = await generatePracticeSet(userId, ohm.id, "QUICK_CHECK");
    const questions = await prisma.question.findMany({ where: { practiceSetId: set.id } });
    const q = (type: string) => questions.find((x) => x.type === type)!;
    let clock = new Date("2026-10-17T10:00:00Z").getTime();
    const tick = () => new Date((clock += 60_000));

    const mcq = await gradeAttempt(userId, q("MCQ").id, { selected: ["a"] }, tick());
    expect(mcq).toMatchObject({ isCorrect: true, feedbackBy: "RULES" });
    await gradeAttempt(userId, q("MCQ").id, { selected: ["a"] }, tick()); // repeat: no extra XP

    const wrongTf = await gradeAttempt(userId, q("TRUE_FALSE").id, { selected: ["t"] }, tick());
    expect(wrongTf.isCorrect).toBe(false);
    const mistake = await addMistakeFromAttempt(userId, wrongTf.attemptId, { whatWentWrong: "Forgot the conditions" });
    expect(mistake.status).toBe("OPEN");
    await gradeAttempt(userId, q("TRUE_FALSE").id, { selected: ["f"] }, tick());
    expect((await prisma.mistake.findUniqueOrThrow({ where: { id: mistake.id } })).status).toBe("RESOLVED");

    const tenTimes = await gradeAttempt(userId, q("NUMERICAL").id, { text: "120" }, tick());
    expect(tenTimes.isCorrect).toBe(false);
    expect(tenTimes.feedback).toMatch(/power of ten/);
    expect((await gradeAttempt(userId, q("NUMERICAL").id, { text: "12.05" }, tick())).isCorrect).toBe(true);

    const written = await gradeAttempt(userId, q("SHORT_ANSWER").id, { text: "The definition is V = IR, and an example is a resistor in a torch circuit." }, tick());
    expect(written.feedbackBy).toBe("MOCK");
    expect(written.score).toBe(1);

    const check = await evaluateUnderstanding(userId, set.id, tick());
    expect(check).toMatchObject({ answered: 4, passed: true });
    await evaluateUnderstanding(userId, set.id, tick());
    expect((await prisma.topic.findUniqueOrThrow({ where: { id: ohm.id } })).understandingCheckedAt).not.toBeNull();

    expect(await xpFor(userId, "PRACTICE_ATTEMPT")).toEqual({ count: 4, points: 8 });
    expect(await xpFor(userId, "UNDERSTANDING_CHECK")).toEqual({ count: 1, points: 25 });
    expect(await xpFor(userId, "MISTAKE_REVIEW")).toEqual({ count: 1, points: 10 });
  });

  it("asks for self-assessment on open answers when AI isn't configured", async () => {
    const { userId, topic } = await studentWithRoadmap();
    const set = await generatePracticeSet(userId, topic("Ohm's law").id, "WRITTEN");
    const open = await prisma.question.findFirstOrThrow({ where: { practiceSetId: set.id, type: "SHORT_ANSWER" } });
    useProvider("none");
    try {
      const r = await gradeAttempt(userId, open.id, { text: "My answer" }, new Date());
      expect(r.needsSelfAssessment).toBe(true);
      expect(r.feedbackBy).toBeNull();
    } finally {
      useProvider("mock");
    }
  });
});

describe("notes, flashcards and spaced revision", () => {
  beforeAll(() => useProvider("mock"));

  it("schedules flashcards with FSRS, flags cards outdated by note edits and exports them", async () => {
    const { userId, topic } = await studentWithRoadmap();
    const t0 = new Date("2026-10-17T10:00:00Z");
    const note = await createNote(userId, { topicId: topic("Ohm's law").id, title: "Ohm", content: NOTES }, t0);
    const made = await generateCardsFromNote(userId, note.id, t0);
    expect(made).toBeGreaterThan(0);
    const due = await dueCards(userId, t0);
    expect(due).toHaveLength(made);

    const next = await reviewCard(userId, due[0].id, 3, t0);
    expect(next.due.getTime()).toBeGreaterThan(t0.getTime());
    expect(await prisma.reviewLog.count({ where: { flashcardId: due[0].id } })).toBe(1);
    expect(await dueCards(userId, t0)).toHaveLength(made - 1);

    await updateNote(userId, note.id, { title: "Ohm", content: `${NOTES}\n\nAdded: resistivity depends on temperature.` }, new Date("2026-10-18T10:00:00Z"));
    const card = await prisma.flashcard.findFirstOrThrow({ where: { noteId: note.id }, include: { note: true } });
    expect(isStale(card)).toBe(true);

    const tsv = await exportCardsTsv(userId);
    expect(tsv.split("\n")).toHaveLength(made);
    expect(tsv).toContain("\t");
  });

  it("puts revisions on the calendar in the student's time zone and spaces the next by recall", async () => {
    const { userId, topic } = await studentWithRoadmap();
    const ohm = topic("Ohm's law");
    const at = new Date("2026-10-17T10:00:00Z");
    const task = await scheduleRevision(userId, { topicId: ohm.id, dateKey: "2026-10-20", time: "19:00" }, at);
    expect(task.dueAt.toISOString()).toBe("2026-10-20T13:30:00.000Z"); // 7 pm in Asia/Kolkata
    const event = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: task.calendarEventId! } });
    expect(event).toMatchObject({ kind: "REVISION", timezone: "Asia/Kolkata", topicId: ohm.id });

    const { next } = await completeRevision(userId, task.id, 0.9, new Date("2026-10-20T14:00:00Z"));
    expect(next?.intervalDays).toBe(3);
    const revised = await prisma.topic.findUniqueOrThrow({ where: { id: ohm.id } });
    expect(revised.revisionCount).toBe(1);
    expect(revised.lastRevisedAt).not.toBeNull();
    expect(await xpFor(userId, "REVISION_COMPLETE")).toEqual({ count: 1, points: 10 });
    // Completing twice changes nothing.
    expect((await completeRevision(userId, task.id, 0.9, new Date())).next).toBeNull();

    const kirchhoff = topic("Kirchhoff's laws");
    const { revision } = await markStudied(userId, kirchhoff.id, at, { scheduleRevision: true });
    expect(revision?.dueAt.getTime()).toBeGreaterThan(at.getTime());
    expect((await prisma.topic.findUniqueOrThrow({ where: { id: kirchhoff.id } })).status).toBe("STUDIED");
  });
});

describe("resources", () => {
  beforeAll(() => useProvider("mock"));

  it("keeps only links the search returned, labels simulated results and validates saved links", async () => {
    const { userId, subject, topic } = await studentWithRoadmap();
    const found = await discoverResources(userId, topic("Ohm's law").id);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => r.origin === "MOCK")).toBe(true);
    expect(found.every((r) => /^https:\/\/(en\.wikipedia\.org|www\.youtube\.com)\//.test(r.url))).toBe(true);
    // Running it again doesn't duplicate.
    expect(await discoverResources(userId, topic("Ohm's law").id)).toHaveLength(0);

    await expect(addOwnResource(userId, { topicId: null, subjectId: subject.id, title: "x", url: "javascript:alert(1)", type: "OTHER", cost: "FREE", note: null })).rejects.toThrow();
    const other = await createTestUser("Other");
    await expect(addOwnResource(other.id, { topicId: null, subjectId: subject.id, title: "x", url: "https://example.org", type: "OTHER", cost: "FREE", note: null })).rejects.toThrow(/Subject not found/);
    const mine = await addOwnResource(userId, { topicId: topic("Ohm's law").id, subjectId: null, title: "NCERT", url: "https://ncert.nic.in/textbook.php", type: "OER_TEXTBOOK", cost: "FREE", note: null });
    expect(mine).toMatchObject({ origin: "STUDENT", saved: true, subjectId: subject.id });
  });
});

describe("per-student isolation of study material", () => {
  beforeAll(() => useProvider("mock"));

  it("never exposes one student's materials, questions or cards to another", async () => {
    const a = await studentWithRoadmap();
    const b = await createTestUser("Student B");
    const ohm = a.topic("Ohm's law");
    const [sourceId] = await addMaterials(a.userId, a.subject.id, [{ fileName: "notes.txt", mime: "text/plain", data: Buffer.from(NOTES) }]);
    await runJobsUntilIdle({ types: ["source.process"] });
    const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
    const stored = await prisma.storedFile.findFirstOrThrow({ where: { key: source.fileKey! } });
    const set = await generatePracticeSet(a.userId, ohm.id, "QUICK_CHECK");
    const question = await prisma.question.findFirstOrThrow({ where: { practiceSetId: set.id } });
    const note = await createNote(a.userId, { topicId: ohm.id, title: "n", content: NOTES }, new Date());
    await generateCardsFromNote(a.userId, note.id, new Date());
    const card = await prisma.flashcard.findFirstOrThrow({ where: { userId: a.userId } });

    expect(await passagesForTopic(b.id, ohm.id)).toEqual([]);
    expect(await searchPassages(b.id, a.subject.id, "Ohm law")).toEqual([]);
    expect(await getOwnedFile(b.id, stored.id)).toBeNull();
    expect(await deleteMaterial(b.id, sourceId)).toBe(false);
    await expect(addMaterials(b.id, a.subject.id, [{ fileName: "x.txt", mime: "text/plain", data: Buffer.from("hello world") }])).rejects.toThrow(/Subject not found/);
    await expect(requestLesson(b.id, ohm.id, "STANDARD")).rejects.toThrow();
    await expect(gradeAttempt(b.id, question.id, { selected: ["a"] }, new Date())).rejects.toThrow();
    await expect(reviewCard(b.id, card.id, 3, new Date())).rejects.toThrow();
    await expect(createNote(b.id, { topicId: ohm.id, title: "x", content: "y" }, new Date())).rejects.toThrow();
    await expect(scheduleRevision(b.id, { topicId: ohm.id }, new Date())).rejects.toThrow();
    await expect(discoverResources(b.id, ohm.id)).rejects.toThrow();
    expect(await dueCards(b.id, new Date())).toEqual([]);
    expect(await prisma.source.count({ where: { id: sourceId } })).toBe(1);
  });
});
