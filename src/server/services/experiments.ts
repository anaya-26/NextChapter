import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { compareMetric, EXPERIMENT_TEMPLATES, type ExperimentMetric } from "@/lib/experiments";
import { DAY_PARTS } from "@/lib/planner";
import { prisma } from "../db";
import { awardXp, evaluateBadges } from "./xp";
import { detectMissedPattern } from "./sessions";

/**
 * Personal study experiments: one change, a fixed period, a simple metric compared with the
 * same length of time before — reviewed honestly by the student at the end.
 */

type Measured = { value: number | null; n: number };

export async function measure(userId: string, metric: ExperimentMetric, from: Date, to: Date): Promise<Measured> {
  if (metric === "session_completion") {
    const s = await prisma.studySession.findMany({ where: { userId, plannedStart: { gte: from, lt: to }, status: { in: ["COMPLETED", "PARTIAL", "MISSED"] } }, select: { status: true } });
    return { value: s.length ? s.filter((x) => x.status !== "MISSED").length / s.length : null, n: s.length };
  }
  if (metric === "study_minutes") {
    const s = await prisma.studySession.findMany({ where: { userId, status: { in: ["COMPLETED", "PARTIAL"] }, startedAt: { gte: from, lt: to } }, select: { actualMinutes: true } });
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    return { value: s.length ? s.reduce((a, x) => a + (x.actualMinutes ?? 0), 0) / days : null, n: s.length };
  }
  if (metric === "recall") {
    const r = await prisma.revisionTask.findMany({ where: { userId, status: "DONE", completedAt: { gte: from, lt: to }, recallScore: { not: null } }, select: { recallScore: true } });
    return { value: r.length ? r.reduce((a, x) => a + x.recallScore!, 0) / r.length : null, n: r.length };
  }
  const a = await prisma.practiceAttempt.findMany({ where: { userId, attemptedAt: { gte: from, lt: to }, score: { not: null } }, select: { score: true } });
  return { value: a.length ? a.reduce((s, x) => s + x.score!, 0) / a.length : null, n: a.length };
}

export async function proposeExperiment(
  userId: string,
  input: { templateId: string } | { title: string; hypothesis: string; change: string; metric: ExperimentMetric; days: number },
  suggestedBy: "STUDENT" | "RULES" | "AI" | "MOCK",
) {
  const t = "templateId" in input ? EXPERIMENT_TEMPLATES.find((x) => x.id === input.templateId) : { ...input, id: "custom" };
  if (!t) throw new Error("Unknown experiment");
  const existing = await prisma.experiment.findFirst({ where: { userId, title: t.title, status: "PROPOSED" } });
  if (existing) return existing;
  return prisma.experiment.create({
    data: { userId, title: t.title, hypothesis: t.hypothesis, change: t.change, metric: t.metric, baseline: { days: t.days } as Prisma.InputJsonValue, suggestedBy },
  });
}

function daysOf(e: { baseline: Prisma.JsonValue }) {
  return ((e.baseline ?? {}) as { days?: number }).days ?? 7;
}

export async function startExperiment(userId: string, id: string, at: Date) {
  const e = await prisma.experiment.findFirst({ where: { id, userId, status: "PROPOSED" } });
  if (!e) throw new Error("Experiment not found");
  if (await prisma.experiment.findFirst({ where: { userId, status: "ACTIVE" } })) throw new Error("Finish or stop your current experiment first — one change at a time.");
  const days = daysOf(e);
  const before = await measure(userId, e.metric as ExperimentMetric, new Date(at.getTime() - days * 86400000), at);
  return prisma.experiment.update({
    where: { id },
    data: { status: "ACTIVE", startAt: at, endAt: new Date(at.getTime() + days * 86400000), baseline: { days, before } as unknown as Prisma.InputJsonValue },
  });
}

export async function experimentProgress(userId: string, id: string, at: Date) {
  const e = await prisma.experiment.findFirst({ where: { id, userId } });
  if (!e?.startAt || !e.endAt) return null;
  const metric = e.metric as ExperimentMetric;
  const before = ((e.baseline ?? {}) as { before?: Measured }).before ?? { value: null, n: 0 };
  const after = await measure(userId, metric, e.startAt, new Date(Math.min(at.getTime(), e.endAt.getTime())));
  return { before, after, comparison: compareMetric(metric, before, after), daysLeft: Math.max(0, Math.ceil((e.endAt.getTime() - at.getTime()) / 86400000)), ended: at >= e.endAt };
}

export async function completeExperiment(userId: string, id: string, input: { verdict: "HELPED" | "NO_CHANGE" | "WORSE" | "UNSURE"; reflection: string | null }, at: Date) {
  const e = await prisma.experiment.findFirst({ where: { id, userId, status: "ACTIVE" } });
  if (!e) throw new Error("Experiment not found");
  const progress = await experimentProgress(userId, id, at);
  await prisma.experiment.update({
    where: { id },
    data: { status: "COMPLETED", endAt: at < e.endAt! ? at : e.endAt, result: (progress ?? {}) as unknown as Prisma.InputJsonValue, verdict: input.verdict, reflection: input.reflection },
  });
  const xp = await awardXp(userId, { action: "EXPERIMENT", dedupeKey: `experiment:${id}`, reason: `Finished the experiment “${e.title}”`, sourceType: "Experiment", sourceId: id, at });
  await evaluateBadges(userId, at);
  return { xp };
}

export async function abandonExperiment(userId: string, id: string) {
  const res = await prisma.experiment.updateMany({ where: { id, userId, status: { in: ["PROPOSED", "ACTIVE"] } }, data: { status: "ABANDONED" } });
  return res.count === 1;
}

export async function activeExperiment(userId: string) {
  return prisma.experiment.findFirst({ where: { userId, status: "ACTIVE" } });
}

/** Template suggestions that fit the student's recent study log. */
export async function suggestedTemplates(userId: string, at: Date) {
  const pattern = await detectMissedPattern(userId, at);
  const monthAgo = new Date(at.getTime() - 30 * 86400000);
  const [recall, accuracy] = await Promise.all([measure(userId, "recall", monthAgo, at), measure(userId, "practice_accuracy", monthAgo, at)]);
  const picks: { id: string; why: string }[] = [];
  if (pattern) picks.push({ id: pattern.part === "EVENING" ? "short-sessions" : "evening-sessions", why: `${pattern.missed} ${DAY_PARTS.find((p) => p.id === pattern.part)?.label} sessions slipped recently.` });
  if (recall.value != null && recall.n >= 3 && recall.value < 0.65) picks.push({ id: "recall-first", why: `Recall at revision has been about ${Math.round(recall.value * 100)}%.` });
  if (accuracy.value != null && accuracy.n >= 5 && accuracy.value < 0.65) picks.push({ id: "daily-questions", why: `Practice accuracy has been about ${Math.round(accuracy.value * 100)}%.` });
  if (!picks.length) picks.push({ id: "phone-away", why: "A simple change many students find useful." });
  return picks;
}
