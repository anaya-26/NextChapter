import "server-only";
import type { RevisionKind } from "@/generated/prisma/client";
import { addDaysToKey, localDateKey, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { awardXp } from "./xp";

/** Default local time for a revision session, from the student's preferred study times. */
export function preferredStartTime(preferred: string[]): string {
  if (preferred.includes("EVENING")) return "19:00";
  if (preferred.includes("MORNING")) return "09:00";
  if (preferred.includes("EARLY_MORNING")) return "06:30";
  if (preferred.includes("AFTERNOON")) return "15:00";
  if (preferred.includes("NIGHT")) return "21:00";
  return "18:30";
}

/** Next interval (days) from the current one and measured recall (0–1). */
export function nextIntervalDays(current: number, recall: number | null): number {
  if (recall === null) return Math.max(1, Math.round(current * 2));
  if (recall >= 0.8) return Math.min(60, Math.max(2, Math.round(current * 2.5)));
  if (recall >= 0.5) return Math.min(30, Math.max(1, Math.round(current * 1.5)));
  return 1;
}

export async function scheduleRevision(
  userId: string,
  input: { topicId: string; dateKey?: string; time?: string; kind?: RevisionKind; intervalDays?: number; durationMinutes?: number },
  at: Date,
) {
  const topic = await prisma.topic.findFirst({ where: { id: input.topicId, userId }, include: { syllabus: { select: { subjectId: true } } } });
  if (!topic) throw new Error("Topic not found");
  const profile = await getProfile(userId);
  const interval = input.intervalDays ?? 1;
  const dateKey = input.dateKey ?? addDaysToKey(localDateKey(at, profile.timezone), interval);
  const start = zonedToUtc(dateKey, input.time ?? preferredStartTime(profile.preferredStudyTimes), profile.timezone);
  const minutes = input.durationMinutes ?? 20;
  const event = await prisma.calendarEvent.create({
    data: {
      userId,
      title: `Revise: ${topic.title}`,
      kind: "REVISION",
      startAt: start,
      endAt: new Date(start.getTime() + minutes * 60000),
      timezone: profile.timezone,
      topicId: topic.id,
      subjectId: topic.syllabus.subjectId,
      estimatedMinutes: minutes,
      reminderMinutes: [15],
      source: "PLANNER",
    },
  });
  return prisma.revisionTask.create({
    data: { userId, topicId: topic.id, dueAt: start, kind: input.kind ?? "QUIZ", intervalDays: interval, calendarEventId: event.id },
  });
}

/** Completes a revision, records recall, schedules the next one at an adapted interval. */
export async function completeRevision(userId: string, taskId: string, recallScore: number | null, at: Date) {
  const task = await prisma.revisionTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("Revision not found");
  if (task.status === "DONE") return { next: null };
  await prisma.$transaction([
    prisma.revisionTask.update({ where: { id: taskId }, data: { status: "DONE", completedAt: at, recallScore } }),
    prisma.topic.update({ where: { id: task.topicId }, data: { lastRevisedAt: at, revisionCount: { increment: 1 } } }),
    ...(task.calendarEventId ? [prisma.calendarEvent.update({ where: { id: task.calendarEventId }, data: { status: "DONE" } })] : []),
  ]);
  await awardXp(userId, { action: "REVISION_COMPLETE", dedupeKey: `revision:${taskId}`, reason: "Completed a scheduled revision", sourceType: "RevisionTask", sourceId: taskId, at });
  const interval = nextIntervalDays(task.intervalDays, recallScore);
  const next = await scheduleRevision(userId, { topicId: task.topicId, intervalDays: interval, kind: task.kind }, at);
  return { next };
}

export async function skipRevision(userId: string, taskId: string) {
  const task = await prisma.revisionTask.findFirst({ where: { id: taskId, userId } });
  if (!task) return false;
  await prisma.revisionTask.update({ where: { id: taskId }, data: { status: "SKIPPED" } });
  if (task.calendarEventId) await prisma.calendarEvent.update({ where: { id: task.calendarEventId }, data: { status: "CANCELLED" } });
  return true;
}

/** Marks a topic studied and (optionally) schedules the first revision for tomorrow. */
export async function markStudied(userId: string, topicId: string, at: Date, opts: { scheduleRevision?: boolean } = {}) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId } });
  if (!topic) throw new Error("Topic not found");
  await prisma.topic.update({ where: { id: topicId }, data: { status: "STUDIED", studiedAt: topic.studiedAt ?? at } });
  let revision = null;
  if (opts.scheduleRevision) {
    const existing = await prisma.revisionTask.findFirst({ where: { userId, topicId, status: "SCHEDULED" } });
    revision = existing ?? (await scheduleRevision(userId, { topicId, intervalDays: 1 }, at));
  }
  return { revision };
}

export async function revisionsForTopic(userId: string, topicId: string) {
  return prisma.revisionTask.findMany({ where: { userId, topicId }, orderBy: { dueAt: "asc" } });
}

export async function dueRevisions(userId: string, at: Date) {
  return prisma.revisionTask.findMany({
    where: { userId, status: "SCHEDULED", dueAt: { lte: new Date(at.getTime() + 12 * 3600000) } },
    orderBy: { dueAt: "asc" },
    include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } } },
  });
}
