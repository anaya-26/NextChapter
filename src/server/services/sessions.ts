import "server-only";
import { sessionPoints } from "@/lib/xp-rules";
import { DAY_PARTS, dayPartOf, type DayPartId } from "@/lib/planner";
import { localDateKey, parseHm, localTimeKey, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { getProfile, updateProfile } from "./profile";
import { addMemory } from "./memory";
import { awardXp } from "./xp";
import { markStudied } from "./revision";
import { clearFuturePlan, applyPlan } from "./planner";

/**
 * Study sessions: planned vs actual. Missed sessions are noticed without blame; when the same
 * time of day keeps not working, Kadam asks what's in the way and adjusts the plan.
 */

export async function getSession(userId: string, id: string) {
  return prisma.studySession.findFirst({
    where: { id, userId },
    include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } }, subject: { select: { id: true, name: true } }, calendarEvent: true },
  });
}

export async function startSession(userId: string, id: string, at: Date) {
  const s = await prisma.studySession.findFirst({ where: { id, userId } });
  if (!s) throw new Error("Session not found");
  if (s.status === "IN_PROGRESS") return s;
  if (s.status === "COMPLETED" || s.status === "PARTIAL") throw new Error("This session is already finished");
  return prisma.studySession.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: at } });
}

/** An unplanned session started from Today, a topic or the focus timer. */
export async function startAdHocSession(userId: string, input: { title: string; topicId?: string | null; plannedMinutes: number }, at: Date) {
  const topic = input.topicId ? await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true, title: true, syllabus: { select: { subjectId: true } } } }) : null;
  if (input.topicId && !topic) throw new Error("Topic not found");
  return prisma.studySession.create({
    data: {
      userId,
      title: input.title || topic?.title || "Focus session",
      kind: "FOCUS",
      status: "IN_PROGRESS",
      startedAt: at,
      plannedMinutes: input.plannedMinutes,
      topicId: topic?.id ?? null,
      subjectId: topic?.syllabus.subjectId ?? null,
    },
  });
}

export type FinishInput = {
  actualMinutes: number;
  difficulties?: string | null;
  achievements?: string | null;
  energy?: number | null;
  focusQuality?: number | null;
  note?: string | null;
  topicDone?: boolean;
};

export async function finishSession(userId: string, id: string, input: FinishInput, at: Date) {
  const s = await prisma.studySession.findFirst({ where: { id, userId } });
  if (!s) throw new Error("Session not found");
  const actual = Math.max(0, Math.min(600, Math.round(input.actualMinutes)));
  const partial = !!s.plannedMinutes && actual < s.plannedMinutes * 0.6;
  const updated = await prisma.studySession.update({
    where: { id },
    data: {
      status: partial ? "PARTIAL" : "COMPLETED",
      actualMinutes: actual,
      startedAt: s.startedAt ?? new Date(at.getTime() - actual * 60000),
      endedAt: at,
      difficulties: input.difficulties || null,
      achievements: input.achievements || null,
      energy: input.energy ?? null,
      focusQuality: input.focusQuality ?? null,
      note: input.note || null,
    },
  });
  if (s.calendarEventId) await prisma.calendarEvent.update({ where: { id: s.calendarEventId }, data: { status: "DONE" } });
  if (s.topicId) {
    await prisma.topic.updateMany({ where: { id: s.topicId, userId, status: "NOT_STARTED" }, data: { status: "IN_PROGRESS" } });
    if (input.topicDone) await markStudied(userId, s.topicId, at, { scheduleRevision: true });
  }
  const xp = await awardXp(userId, { action: "STUDY_SESSION", points: sessionPoints(actual), dedupeKey: `session:${id}`, reason: `Studied ${actual} min`, sourceType: "StudySession", sourceId: id, at });
  return { session: updated, xp };
}

/** Records study that happened without a plan (the study log's "actual" side). */
export async function logStudy(userId: string, input: { title: string; topicId?: string | null; minutes: number; dateKey: string; time: string; note?: string | null }, at: Date) {
  const profile = await getProfile(userId);
  const topic = input.topicId ? await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true, syllabus: { select: { subjectId: true } } } }) : null;
  if (input.topicId && !topic) throw new Error("Topic not found");
  const startedAt = zonedToUtc(input.dateKey, input.time, profile.timezone);
  if (startedAt.getTime() > at.getTime()) throw new Error("That time is in the future");
  const s = await prisma.studySession.create({
    data: {
      userId,
      title: input.title,
      kind: "STUDY",
      status: "COMPLETED",
      startedAt,
      endedAt: new Date(startedAt.getTime() + input.minutes * 60000),
      actualMinutes: input.minutes,
      topicId: topic?.id ?? null,
      subjectId: topic?.syllabus.subjectId ?? null,
      note: input.note ?? null,
    },
  });
  await awardXp(userId, { action: "STUDY_SESSION", points: sessionPoints(input.minutes), dedupeKey: `session:${s.id}`, reason: `Studied ${input.minutes} min`, sourceType: "StudySession", sourceId: s.id, at });
  return s;
}

export async function missSession(userId: string, id: string, reason: string | null, at: Date) {
  const s = await prisma.studySession.findFirst({ where: { id, userId } });
  if (!s) throw new Error("Session not found");
  await prisma.studySession.update({ where: { id }, data: { status: "MISSED", missedReason: reason, updatedAt: at } });
  return detectMissedPattern(userId, at);
}

/** Planned sessions whose time passed long ago without being started count as missed. */
export async function autoMarkMissed(userId: string, at: Date) {
  const overdue = await prisma.studySession.findMany({ where: { userId, status: "PLANNED", plannedStart: { lt: new Date(at.getTime() - 3 * 3600_000) } }, select: { id: true, plannedStart: true, plannedMinutes: true } });
  const ids = overdue.filter((s) => s.plannedStart!.getTime() + (s.plannedMinutes ?? 60) * 60000 + 3 * 3600_000 < at.getTime()).map((s) => s.id);
  if (ids.length) await prisma.studySession.updateMany({ where: { id: { in: ids } }, data: { status: "MISSED" } });
  return ids.length;
}

export type MissedPattern = { part: DayPartId; label: string; missed: number; completed: number };

/**
 * Looks for a time of day that keeps not working (≥3 missed and at most as many completed in
 * three weeks). Proposes an obstacle discussion once, and records a tentative pattern only
 * if the student allows pattern inference.
 */
export async function detectMissedPattern(userId: string, at: Date): Promise<MissedPattern | null> {
  const profile = await getProfile(userId);
  const since = new Date(at.getTime() - 21 * 86400000);
  const sessions = await prisma.studySession.findMany({
    where: { userId, plannedStart: { gte: since, lte: at }, status: { in: ["MISSED", "COMPLETED", "PARTIAL"] } },
    select: { status: true, plannedStart: true },
  });
  const buckets = new Map<DayPartId, { missed: number; completed: number }>();
  for (const s of sessions) {
    const part = dayPartOf(parseHm(localTimeKey(s.plannedStart!, profile.timezone)));
    const b = buckets.get(part) ?? { missed: 0, completed: 0 };
    if (s.status === "MISSED") b.missed++;
    else b.completed++;
    buckets.set(part, b);
  }
  const worst = [...buckets.entries()].filter(([, b]) => b.missed >= 3 && b.missed >= b.completed).sort((a, b) => b[1].missed - a[1].missed)[0];
  if (!worst) return null;
  const [part, counts] = worst;
  const label = DAY_PARTS.find((p) => p.id === part)!.label;
  const recent = await prisma.suggestedAction.findFirst({
    where: { userId, actionType: "OBSTACLE_DISCUSSION", payload: { path: ["part"], equals: part }, createdAt: { gte: new Date(at.getTime() - 14 * 86400000) } },
  });
  if (!recent) {
    await prisma.suggestedAction.create({
      data: {
        userId,
        origin: "PLANNER",
        actionType: "OBSTACLE_DISCUSSION",
        title: `${label[0].toUpperCase()}${label.slice(1)} sessions keep slipping`,
        reason: `${counts.missed} of ${counts.missed + counts.completed} planned ${label} sessions in the last three weeks didn't happen.`,
        payload: { part, missed: counts.missed, completed: counts.completed },
        createdAt: at,
      },
    });
    await addMemory(userId, {
      content: `Planned ${label} study sessions are often missed (${counts.missed} of ${counts.missed + counts.completed} in three weeks).`,
      kind: "PATTERN",
      source: "INFERRED",
      certainty: "TENTATIVE",
      evidence: `Study log up to ${localDateKey(at, profile.timezone)}`,
    });
  }
  return { part, label, ...counts };
}

export const OBSTACLE_REASONS = ["Too tired at that time", "Classes or coaching run late", "Travel or commute", "Phone or other distractions", "Family responsibilities", "The topic felt too hard to start", "Something else"] as const;

/** The student says what got in the way and picks an adjustment; the plan changes accordingly. */
export async function resolveObstacle(
  userId: string,
  actionId: string,
  input: { reason: string; adjustment: "MOVE" | "SHORTEN" | "KEEP"; moveTo?: DayPartId | null; note?: string | null },
  at: Date,
) {
  const action = await prisma.suggestedAction.findFirst({ where: { id: actionId, userId, actionType: "OBSTACLE_DISCUSSION", status: "PROPOSED" } });
  if (!action) throw new Error("Already handled");
  const part = (action.payload as { part: DayPartId }).part;
  const label = DAY_PARTS.find((p) => p.id === part)!.label;
  const profile = await getProfile(userId);
  let changed = 0;
  if (input.adjustment === "MOVE" && input.moveTo && input.moveTo !== part) {
    const times = [...new Set([...profile.preferredStudyTimes.filter((t) => t !== part), input.moveTo])];
    await updateProfile(userId, { preferredStudyTimes: times });
    await clearFuturePlan(userId, at);
    changed = (await applyPlan(userId, at)).created;
  } else if (input.adjustment === "SHORTEN") {
    const future = await prisma.studySession.findMany({ where: { userId, status: "PLANNED", plannedStart: { gt: at } }, include: { calendarEvent: true } });
    for (const s of future) {
      if (dayPartOf(parseHm(localTimeKey(s.plannedStart!, profile.timezone))) !== part || (s.plannedMinutes ?? 0) <= 25) continue;
      await prisma.studySession.update({ where: { id: s.id }, data: { plannedMinutes: 25 } });
      if (s.calendarEvent) await prisma.calendarEvent.update({ where: { id: s.calendarEvent.id }, data: { endAt: new Date(s.plannedStart!.getTime() + 25 * 60000), estimatedMinutes: 25 } });
      changed++;
    }
  }
  const reason = input.reason.slice(0, 200);
  await addMemory(userId, {
    content: `What gets in the way of ${label} study: ${reason}${input.note ? ` — ${input.note.slice(0, 300)}` : ""}.`,
    kind: "OBSTACLE",
    source: "STUDENT",
  });
  await prisma.suggestedAction.update({ where: { id: action.id }, data: { status: input.adjustment === "KEEP" ? "DISMISSED" : "ACCEPTED", resolvedAt: at } });
  return { changed };
}

/** Sessions for a local day (planned or done) — used by Today. */
export async function sessionsOn(userId: string, dateKey: string, tz: string) {
  const start = zonedToUtc(dateKey, "00:00", tz);
  const end = new Date(start.getTime() + 86400000);
  return prisma.studySession.findMany({
    where: { userId, OR: [{ plannedStart: { gte: start, lt: end } }, { startedAt: { gte: start, lt: end } }] },
    orderBy: [{ plannedStart: "asc" }, { startedAt: "asc" }],
    include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } } },
  });
}
