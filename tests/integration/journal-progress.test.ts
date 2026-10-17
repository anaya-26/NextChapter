import { beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { zonedToUtc } from "@/lib/time";
import { createSubject } from "@/server/services/subjects";
import { confirmSyllabus, createSyllabus } from "@/server/services/syllabus";
import { updatePrivacy } from "@/server/services/profile";
import { createEntry, daySummary, deleteEntry, getEntry, studyLog, updateEntry } from "@/server/services/journal";
import { generateWeeklyReview, weekStats } from "@/server/services/weekly-review";
import { acceptSuggestion, dismissSuggestion, openSuggestions } from "@/server/services/suggestions";
import { abandonExperiment, completeExperiment, experimentProgress, proposeExperiment, startExperiment } from "@/server/services/experiments";
import { finishSession, startSession } from "@/server/services/sessions";
import { progressOverview } from "@/server/services/progress";
import { createTestUser } from "../helpers/db";

const TZ = "Asia/Kolkata";
const WED = zonedToUtc("2026-10-21", "21:00", TZ);
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  resetEnvCache();
  resetAiProvider();
}

async function student() {
  const { id } = await createTestUser();
  const subject = await createSubject(id, { name: "Physics" });
  const { syllabus } = await createSyllabus(id, { subjectId: subject.id, title: "", files: [], pastedText: "Unit I: Current Electricity\nChapter 3: Current Electricity — Ohm's law; Kirchhoff's laws." });
  await runJobsUntilIdle({ types: ["syllabus.extract"] });
  await confirmSyllabus(id, syllabus.id, WED);
  await runJobsUntilIdle({ types: ["roadmap.enrich"] });
  const all = await prisma.topic.findMany({ where: { userId: id, kind: "REQUIRED" }, orderBy: { order: "asc" } });
  const ohm = all.find((t) => t.title === "Ohm's law")!;
  return { userId: id, topics: [ohm, ...all.filter((t) => t.id !== ohm.id)] };
}

async function session(userId: string, dateKey: string, time: string, status: "COMPLETED" | "MISSED", minutes = 45, topicId?: string) {
  return prisma.studySession.create({
    data: {
      userId,
      status,
      title: "Study",
      plannedStart: zonedToUtc(dateKey, time, TZ),
      plannedMinutes: 45,
      startedAt: status === "COMPLETED" ? zonedToUtc(dateKey, time, TZ) : null,
      actualMinutes: status === "COMPLETED" ? minutes : null,
      topicId: topicId ?? null,
    },
  });
}

beforeAll(() => useProvider("mock"));

describe("journal", () => {
  it("awards check-in and reflection XP once a day and keeps photos private to the entry", async () => {
    const { userId } = await student();
    const first = await createEntry(userId, { kind: "CHECK_IN", dateKey: "2026-10-21", mood: 4, energy: 3, text: "Okay day", aiAccess: false }, WED);
    expect(first.xp).toBe(5);
    expect((await createEntry(userId, { kind: "CHECK_IN", dateKey: "2026-10-21", mood: 3, aiAccess: false }, WED)).xp).toBe(0);
    const short = await createEntry(userId, { kind: "REFLECTION", dateKey: "2026-10-21", text: "Too short", aiAccess: false }, WED);
    expect(short.xp).toBe(0);
    const long = await createEntry(
      userId,
      { kind: "REFLECTION", dateKey: "2026-10-21", text: "Today I worked through Ohm's law problems and finally understood why the graph is a straight line. ".repeat(3), photos: [{ fileName: "notes.png", mime: "image/png", data: PNG }], aiAccess: false },
      WED,
    );
    expect(long.xp).toBe(10);
    expect(long.entry.photoFileKeys).toHaveLength(1);
    await expect(createEntry(userId, { kind: "NOTE", dateKey: "2026-10-22", text: "x", aiAccess: false }, WED)).rejects.toThrow(/future/);
    await expect(createEntry(userId, { kind: "NOTE", dateKey: "2026-10-21", text: "x", aiAccess: false, photos: [{ fileName: "x.exe", mime: "application/octet-stream", data: PNG }] }, WED)).rejects.toThrow(/image/);

    expect(await prisma.storedFile.count({ where: { userId, purpose: "JOURNAL_PHOTO" } })).toBe(1);
    await deleteEntry(userId, long.entry.id);
    expect(await prisma.storedFile.count({ where: { userId, purpose: "JOURNAL_PHOTO" } })).toBe(0);
  });

  it("lets the AI read an entry only with both permissions, and forgets it when revoked", async () => {
    const { userId } = await student();
    const input = { kind: "REFLECTION" as const, dateKey: "2026-10-21", text: "Studied in the evening, went well.", difficulties: "Kirchhoff's laws sign conventions", topicsStudied: ["Kirchhoff's laws"], aiAccess: true };
    // Per-entry permission without the master switch: nothing is read.
    const blocked = await createEntry(userId, input, WED);
    await runJobsUntilIdle({ types: ["journal.analyze"] });
    expect(await prisma.memoryItem.count({ where: { journalEntryId: blocked.entry.id } })).toBe(0);

    await updatePrivacy(userId, { aiUseJournal: true });
    const shared = await createEntry(userId, input, WED);
    await runJobsUntilIdle({ types: ["journal.analyze"] });
    const memories = await prisma.memoryItem.findMany({ where: { journalEntryId: shared.entry.id } });
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.every((m) => m.source === "JOURNAL" && m.certainty === "TENTATIVE")).toBe(true);
    const suggestions = await openSuggestions(userId, { origin: "JOURNAL", sourceId: shared.entry.id });
    expect(suggestions.map((s) => s.actionType)).toEqual(["PRACTICE_TOPIC"]);

    const notShared = await createEntry(userId, { ...input, aiAccess: false }, WED);
    await runJobsUntilIdle({ types: ["journal.analyze"] });
    expect(await prisma.memoryItem.count({ where: { journalEntryId: notShared.entry.id } })).toBe(0);

    await updateEntry(userId, shared.entry.id, { aiAccess: false });
    expect(await prisma.memoryItem.count({ where: { journalEntryId: shared.entry.id } })).toBe(0);
    expect(await openSuggestions(userId, { origin: "JOURNAL", sourceId: shared.entry.id })).toEqual([]);
  });

  it("shows support instead of analysing an entry that sounds like distress", async () => {
    const { userId } = await student();
    await updatePrivacy(userId, { aiUseJournal: true });
    const e = await createEntry(userId, { kind: "REFLECTION", dateKey: "2026-10-21", text: "I feel hopeless about the exams.", aiAccess: true }, WED);
    await runJobsUntilIdle({ types: ["journal.analyze"] });
    expect(await prisma.job.count({ where: { type: "journal.analyze", payload: { path: ["entryId"], equals: e.entry.id } } })).toBe(0);
    expect(await prisma.memoryItem.count({ where: { journalEntryId: e.entry.id } })).toBe(0);
  });

  it("builds the study log and today's planned-vs-actual summary", async () => {
    const { userId, topics } = await student();
    await session(userId, "2026-10-21", "17:00", "COMPLETED", 50, topics[0].id);
    await session(userId, "2026-10-21", "19:00", "MISSED");
    const log = await studyLog(userId, WED, 7);
    const today = log[0];
    expect(today).toMatchObject({ dateKey: "2026-10-21", plannedMinutes: 90, actualMinutes: 50 });
    const summary = await daySummary(userId, "2026-10-21", WED);
    expect(summary.planned).toMatch(/^2 sessions planned/);
    expect(summary.actual).toMatch(/50 min studied: Ohm's law; 1 didn’t happen/);
    expect(summary.topics).toEqual(["Ohm's law"]);
  });
});

describe("weekly review and suggestions", () => {
  it("summarises the week from real numbers and only reads shared entries", async () => {
    const { userId, topics } = await student();
    await updatePrivacy(userId, { aiUseJournal: true });
    await session(userId, "2026-10-19", "17:00", "COMPLETED", 45, topics[0].id);
    await session(userId, "2026-10-20", "06:00", "MISSED");
    await session(userId, "2026-10-21", "06:00", "MISSED");
    const shared = await createEntry(userId, { kind: "REFLECTION", dateKey: "2026-10-20", text: "Good evening session", aiAccess: true }, WED);
    await createEntry(userId, { kind: "REFLECTION", dateKey: "2026-10-21", text: "Private thoughts", aiAccess: false }, WED);

    const stats = await weekStats(userId, "2026-10-19");
    expect(stats).toMatchObject({ minutesPlanned: 135, minutesActual: 45, sessionsCompleted: 1, sessionsMissed: 2, activeDays: 1, missedByPart: { EARLY_MORNING: 2 } });
    const review = await generateWeeklyReview(userId, "2026-10-19", WED);
    expect(review.generatedBy).toBe("MOCK");
    expect(review.usedEntryIds).toEqual([shared.entry.id]);
    const summary = review.summary as { highlights: string[]; patterns: string[]; encouragement: string };
    expect(summary.highlights[0]).toMatch(/Studied 45 min on 1 day/);
    expect(summary.patterns[0]).toMatch(/2 early morning sessions didn’t happen/);
    expect(summary.encouragement).toMatch(/Simulated AI/);
    // Regenerating replaces, not duplicates.
    await generateWeeklyReview(userId, "2026-10-19", WED);
    expect(await prisma.weeklyReview.count({ where: { userId } })).toBe(1);
    const suggestions = await openSuggestions(userId, { origin: "WEEKLY_REVIEW" });
    expect(suggestions.map((s) => s.actionType)).toEqual(expect.arrayContaining(["START_EXPERIMENT", "PLAN_WEEK"]));

    const exp = suggestions.find((s) => s.actionType === "START_EXPERIMENT")!;
    const r = await acceptSuggestion(userId, exp.id, WED);
    expect(r.href).toMatch(/^\/progress\/experiments#/);
    expect(await prisma.experiment.count({ where: { userId, status: "PROPOSED" } })).toBe(1);
    const plan = suggestions.find((s) => s.actionType === "PLAN_WEEK")!;
    expect(await dismissSuggestion(userId, plan.id, WED)).toBe(true);
    await expect(acceptSuggestion(userId, plan.id, WED)).rejects.toThrow();
  });

  it("works without AI using the rules", async () => {
    useProvider("none");
    try {
      const { userId } = await student();
      await session(userId, "2026-10-19", "17:00", "COMPLETED");
      const review = await generateWeeklyReview(userId, "2026-10-19", WED);
      expect(review.generatedBy).toBe("RULES");
      expect(review.usedEntryIds).toEqual([]);
    } finally {
      useProvider("mock");
    }
  });
});

describe("experiments", () => {
  it("compares a week with the week before and awards XP once on review", async () => {
    const { userId } = await student();
    for (const d of ["2026-10-13", "2026-10-14", "2026-10-16"]) await session(userId, d, "06:00", "MISSED");
    await session(userId, "2026-10-15", "18:00", "COMPLETED");
    const start = zonedToUtc("2026-10-19", "08:00", TZ);
    const exp = await proposeExperiment(userId, { templateId: "evening-sessions" }, "STUDENT");
    const started = await startExperiment(userId, exp.id, start);
    expect((started.baseline as { before: { value: number; n: number } }).before).toEqual({ value: 0.25, n: 4 });
    const second = await proposeExperiment(userId, { templateId: "phone-away" }, "STUDENT");
    await expect(startExperiment(userId, second.id, start)).rejects.toThrow(/one change at a time/);

    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21"]) {
      const s = await prisma.studySession.create({ data: { userId, status: "PLANNED", plannedStart: zonedToUtc(d, "18:00", TZ), plannedMinutes: 45 } });
      await startSession(userId, s.id, s.plannedStart!);
      await finishSession(userId, s.id, { actualMinutes: 45 }, new Date(s.plannedStart!.getTime() + 2700_000));
    }
    expect(await prisma.studySession.count({ where: { userId, experimentId: exp.id } })).toBe(3);
    const progress = await experimentProgress(userId, exp.id, WED);
    expect(progress?.after).toEqual({ value: 1, n: 3 });
    expect(progress?.comparison.direction).toBe("up");
    expect(progress?.daysLeft).toBe(5);

    const done = await completeExperiment(userId, exp.id, { verdict: "HELPED", reflection: "Evenings work better for me" }, WED);
    expect(done.xp.points).toBe(15);
    await expect(completeExperiment(userId, exp.id, { verdict: "HELPED", reflection: null }, WED)).rejects.toThrow();
    expect(await prisma.userBadge.count({ where: { userId, badgeCode: "experimenter" } })).toBe(1);
    expect(await abandonExperiment(userId, second.id)).toBe(true);
  });
});

describe("progress overview", () => {
  it("shows level, badges, weekly trends and consistency without inflating XP", async () => {
    const { userId, topics } = await student();
    await session(userId, "2026-10-19", "17:00", "COMPLETED", 60, topics[0].id);
    await createEntry(userId, { kind: "CHECK_IN", dateKey: "2026-10-21", mood: 4, aiAccess: false }, WED);
    const p = await progressOverview(userId, WED);
    expect(p.xp.total).toBe(25); // 20 syllabus + 5 check-in (the hand-made session row has no XP)
    expect(p.xp.level).toBe(1);
    expect(p.badges.find((b) => b.code === "syllabus-mapped")?.awardedAt).not.toBeNull();
    expect(p.series).toHaveLength(8);
    expect(p.series.at(-1)).toMatchObject({ weekKey: "2026-10-19", actualMinutes: 60 });
    expect(p.heat.find((h) => h.dateKey === "2026-10-19")).toMatchObject({ minutes: 60, active: true });
    expect(p.heat.find((h) => h.dateKey === "2026-10-25")?.future).toBe(true);
    expect(p.improvements).toEqual([]); // not enough practice data to claim improvement
    expect(p.topicStats[0]).toMatchObject({ name: "Physics", studied: 0 });
    expect(p.topicStats[0].total).toBeGreaterThanOrEqual(2);
  });
});

describe("isolation", () => {
  it("keeps journals, suggestions and experiments private to their owner", async () => {
    const a = await student();
    const b = await createTestUser("Other");
    const { entry } = await createEntry(a.userId, { kind: "NOTE", dateKey: "2026-10-21", text: "private", aiAccess: false }, WED);
    expect(await getEntry(b.id, entry.id)).toBeNull();
    await expect(updateEntry(b.id, entry.id, { text: "changed" })).rejects.toThrow(/not found/);
    expect(await deleteEntry(b.id, entry.id)).toBe(false);
    const exp = await proposeExperiment(a.userId, { templateId: "phone-away" }, "STUDENT");
    await expect(startExperiment(b.id, exp.id, WED)).rejects.toThrow(/not found/);
    const s = await prisma.suggestedAction.create({ data: { userId: a.userId, origin: "JOURNAL", title: "x", reason: "y", actionType: "PLAN_WEEK", payload: {} } });
    await expect(acceptSuggestion(b.id, s.id, WED)).rejects.toThrow();
    expect((await progressOverview(b.id, WED)).xp.total).toBe(0);
    expect((await getEntry(a.userId, entry.id))?.text).toBe("private");
  });
});
