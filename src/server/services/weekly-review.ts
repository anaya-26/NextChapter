import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { DAY_PARTS, dayPartOf } from "@/lib/planner";
import { addDaysToKey, dateOnly, formatDuration, localDateKey, localTimeKey, parseHm, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { getPrivacy, getProfile } from "./profile";
import { recurringDifficulties } from "./mistakes";
import { saveSuggestions, SUGGESTION_TYPES, type SuggestionType } from "./journal";
import { EXPERIMENT_TEMPLATES } from "@/lib/experiments";

export type WeekStats = Awaited<ReturnType<typeof weekStats>>;

/** Plain numbers about one week (Monday start), from the study log and practice. */
export async function weekStats(userId: string, startKey: string) {
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const from = zonedToUtc(startKey, "00:00", tz);
  const to = zonedToUtc(addDaysToKey(startKey, 7), "00:00", tz);
  const [sessions, attempts, revisions, reviews, mistakesAdded, mistakesResolved, checkIns] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, OR: [{ plannedStart: { gte: from, lt: to } }, { plannedStart: null, startedAt: { gte: from, lt: to } }] },
      include: { topic: { select: { title: true } } },
    }),
    prisma.practiceAttempt.findMany({ where: { userId, attemptedAt: { gte: from, lt: to }, score: { not: null } }, select: { score: true } }),
    prisma.revisionTask.findMany({ where: { userId, status: "DONE", completedAt: { gte: from, lt: to } }, select: { recallScore: true } }),
    prisma.reviewLog.count({ where: { userId, reviewedAt: { gte: from, lt: to } } }),
    prisma.mistake.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
    prisma.mistake.count({ where: { userId, resolvedAt: { gte: from, lt: to } } }),
    prisma.journalEntry.findMany({ where: { userId, kind: "CHECK_IN", date: { gte: dateOnly(startKey), lt: dateOnly(addDaysToKey(startKey, 7)) } }, select: { mood: true, energy: true } }),
  ]);
  const done = sessions.filter((s) => s.status === "COMPLETED" || s.status === "PARTIAL");
  const missed = sessions.filter((s) => s.status === "MISSED");
  const missedByPart: Record<string, number> = {};
  for (const s of missed) {
    if (!s.plannedStart) continue;
    const part = dayPartOf(parseHm(localTimeKey(s.plannedStart, tz)));
    missedByPart[part] = (missedByPart[part] ?? 0) + 1;
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const activeDays = new Set(done.map((s) => localDateKey(s.startedAt ?? s.plannedStart!, tz))).size;
  return {
    startKey,
    minutesPlanned: sessions.filter((s) => s.plannedStart).reduce((a, s) => a + (s.plannedMinutes ?? 0), 0),
    minutesActual: done.reduce((a, s) => a + (s.actualMinutes ?? 0), 0),
    sessionsCompleted: done.length,
    sessionsMissed: missed.length,
    activeDays,
    topicsStudied: [...new Set(done.map((s) => s.topic?.title).filter((t): t is string => !!t))],
    attempts: attempts.length,
    accuracy: avg(attempts.map((a) => a.score!)),
    revisionsDone: revisions.length,
    avgRecall: avg(revisions.map((r) => r.recallScore).filter((x): x is number => x != null)),
    cardsReviewed: reviews,
    mistakesAdded,
    mistakesResolved,
    checkIns: checkIns.length,
    avgMood: avg(checkIns.map((c) => c.mood).filter((x): x is number => x != null)),
    avgEnergy: avg(checkIns.map((c) => c.energy).filter((x): x is number => x != null)),
    missedByPart,
  };
}

export type ReviewSummary = {
  highlights: string[];
  patterns: string[];
  difficulties: string[];
  encouragement: string;
  stats: WeekStats;
};

const reviewSchema = z.object({
  highlights: z.array(z.string()),
  patterns: z.array(z.string()),
  difficulties: z.array(z.string()),
  suggestions: z.array(z.object({ title: z.string(), reason: z.string(), type: z.enum(SUGGESTION_TYPES), topicTitle: z.string().nullable() })),
  encouragement: z.string(),
});

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** Rule-based review used without AI (and as the factual base for the AI version). */
export function rulesReview(stats: WeekStats, recurring: { topic: { title: string }; count: number }[]) {
  const highlights: string[] = [];
  if (stats.minutesActual) highlights.push(`Studied ${formatDuration(stats.minutesActual)} on ${stats.activeDays} day${stats.activeDays === 1 ? "" : "s"}${stats.minutesPlanned ? ` (planned ${formatDuration(stats.minutesPlanned)})` : ""}.`);
  if (stats.topicsStudied.length) highlights.push(`Worked on ${stats.topicsStudied.slice(0, 4).join(", ")}${stats.topicsStudied.length > 4 ? "…" : ""}.`);
  if (stats.attempts) highlights.push(`Answered ${stats.attempts} practice question${stats.attempts === 1 ? "" : "s"} at ${pct(stats.accuracy)} accuracy.`);
  if (stats.revisionsDone) highlights.push(`Completed ${stats.revisionsDone} revision${stats.revisionsDone === 1 ? "" : "s"}${stats.avgRecall != null ? `, recalling about ${pct(stats.avgRecall)}` : ""}.`);
  if (stats.mistakesResolved) highlights.push(`Resolved ${stats.mistakesResolved} mistake${stats.mistakesResolved === 1 ? "" : "s"}.`);
  if (!highlights.length) highlights.push("A quiet week — that happens. Next week can start small.");
  const patterns: string[] = [];
  const worst = Object.entries(stats.missedByPart).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 2) patterns.push(`${worst[1]} ${DAY_PARTS.find((p) => p.id === worst[0])?.label ?? ""} sessions didn’t happen — that time may not suit you right now.`);
  if (stats.minutesPlanned && stats.minutesActual < stats.minutesPlanned * 0.5) patterns.push("Less than half of the planned time happened — the plan may be too full.");
  const difficulties = recurring.slice(0, 3).map((r) => `${r.topic.title}: ${r.count} open mistakes`);
  const suggestions: { title: string; reason: string; type: SuggestionType; topicTitle: string | null; templateId?: string }[] = [];
  for (const r of recurring.slice(0, 1)) suggestions.push({ title: `Revisit ${r.topic.title}`, reason: `${r.count} mistakes are still open there.`, type: "REVISIT_TOPIC", topicTitle: r.topic.title });
  if (worst && worst[1] >= 2) suggestions.push({ title: "Try an evening-sessions experiment", reason: "Sessions at one time of day kept slipping.", type: "START_EXPERIMENT", topicTitle: null, templateId: "evening-sessions" });
  else if (stats.avgRecall != null && stats.avgRecall < 0.6) suggestions.push({ title: "Try recalling before re-reading", reason: `Recall at revision was about ${pct(stats.avgRecall)}.`, type: "START_EXPERIMENT", topicTitle: null, templateId: "recall-first" });
  suggestions.push({ title: "Plan next week", reason: "A realistic plan around your classes makes starting easier.", type: "PLAN_WEEK", topicTitle: null });
  return { highlights, patterns, difficulties, suggestions: suggestions.slice(0, 3), encouragement: stats.minutesActual ? "Every session counts — keep going at a pace you can sustain." : "Coming back is what matters. One short session is a great start." };
}

export async function generateWeeklyReview(userId: string, startKey: string, at: Date) {
  const [stats, recurring, privacy] = await Promise.all([weekStats(userId, startKey), recurringDifficulties(userId), getPrivacy(userId)]);
  const base = rulesReview(stats, recurring);
  const entries = privacy.aiUseJournal
    ? await prisma.journalEntry.findMany({ where: { userId, aiAccess: true, date: { gte: dateOnly(startKey), lt: dateOnly(addDaysToKey(startKey, 7)) } }, orderBy: { date: "asc" } })
    : [];
  const ai = getAiProvider();
  let result = base;
  let generatedBy: "AI" | "MOCK" | "RULES" = "RULES";
  let model: string | null = null;
  if (ai) {
    const r = await withAi(userId, "weekly_review", (p) =>
      p.generateObject({
        feature: "weekly_review",
        userId,
        system: `${CORE_RULES}\n\n## Task: a short, kind weekly review\nUse the week's numbers (trusted, computed by the app) and any journal entries the student chose to share (reference material). Give up to 4 specific highlights, up to 3 tentative patterns (say "might" / "seems"), up to 3 difficulties, up to 3 small next-week suggestions, and one encouraging sentence. Celebrate effort and returns, never shame missed work, never invent numbers.`,
        task: `Week starting ${startKey}. Numbers: ${JSON.stringify({ ...stats, missedByPart: stats.missedByPart })}. Recurring difficulties: ${recurring.map((r) => `${r.topic.title} (${r.count})`).join(", ") || "none"}. Rule-based draft: ${JSON.stringify(base)}`,
        references: entries.map((e) => ({ id: `journal-${e.id}`, title: `Journal ${e.date.toISOString().slice(0, 10)}`, text: [e.text, e.achievements && `Went well: ${e.achievements}`, e.difficulties && `Difficult: ${e.difficulties}`].filter(Boolean).join("\n") })),
        schema: reviewSchema,
        effort: "low",
      }),
    );
    result = { ...r.data, highlights: r.data.highlights.slice(0, 4), patterns: r.data.patterns.slice(0, 3), difficulties: r.data.difficulties.slice(0, 3), suggestions: r.data.suggestions.slice(0, 3) };
    generatedBy = ai.name === "mock" ? "MOCK" : "AI";
    model = r.model;
  }
  const summary: ReviewSummary = { highlights: result.highlights, patterns: result.patterns, difficulties: result.difficulties, encouragement: result.encouragement, stats };
  const review = await prisma.weeklyReview.upsert({
    where: { userId_weekStart: { userId, weekStart: dateOnly(startKey) } },
    create: { userId, weekStart: dateOnly(startKey), summary: summary as unknown as Prisma.InputJsonValue, usedEntryIds: entries.map((e) => e.id), generatedBy, model, createdAt: at },
    update: { summary: summary as unknown as Prisma.InputJsonValue, usedEntryIds: entries.map((e) => e.id), generatedBy, model, createdAt: at },
  });
  await saveSuggestions(
    userId,
    "WEEKLY_REVIEW",
    review.id,
    result.suggestions.map((s) => ({ ...s, templateId: (s as { templateId?: string }).templateId ?? (s.type === "START_EXPERIMENT" ? EXPERIMENT_TEMPLATES[0].id : undefined) })),
    generatedBy,
  );
  return review;
}

export async function listReviews(userId: string) {
  return prisma.weeklyReview.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: 12 });
}
