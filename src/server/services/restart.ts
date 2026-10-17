import "server-only";
import { addDaysToKey, localDateKey } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { applyPlan, clearFuturePlan } from "./planner";
import { autoMarkMissed } from "./sessions";
import { preferredStartTime, scheduleRevision } from "./revision";

/**
 * "Fresh start": when a student has fallen behind or comes back after a break, Kadam shows the
 * backlog without judgement and offers a few ways to restart with a lighter, realistic plan.
 */

export type RestartMode = "FRESH_START" | "CATCH_UP" | "EXAM_FIRST";

export async function getBacklog(userId: string, at: Date) {
  await autoMarkMissed(userId, at);
  // Count only what slipped since the last restart (a restart is a clean slate).
  const lastRestart = await prisma.suggestedAction.findFirst({ where: { userId, actionType: "RESTART" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const since = new Date(Math.max(at.getTime() - 14 * 86400000, lastRestart?.createdAt.getTime() ?? 0));
  const [missed, overdueRevisions, overdueDeadlines, lastActivity, exams] = await Promise.all([
    prisma.studySession.findMany({ where: { userId, status: "MISSED", plannedStart: { gte: since } }, select: { plannedMinutes: true } }),
    prisma.revisionTask.findMany({ where: { userId, status: "SCHEDULED", dueAt: { lt: new Date(at.getTime() - 12 * 3600_000) } }, include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } } }, orderBy: { dueAt: "asc" } }),
    prisma.calendarEvent.findMany({ where: { userId, isDeadline: true, status: "CONFIRMED", startAt: { gte: new Date(at.getTime() - 14 * 86400000), lt: at } }, orderBy: { startAt: "asc" } }),
    prisma.xpEvent.findFirst({ where: { userId, isDemo: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.subject.findMany({ where: { userId, status: "ACTIVE", examDate: { gte: at, lt: new Date(at.getTime() + 30 * 86400000) } }, select: { id: true, name: true, examDate: true } }),
  ]);
  const lastSeen = Math.max(lastActivity?.createdAt.getTime() ?? 0, lastRestart?.createdAt.getTime() ?? 0);
  const daysAway = lastSeen ? Math.floor((at.getTime() - lastSeen) / 86400000) : 0;
  return {
    missedSessions: missed.length,
    missedMinutes: missed.reduce((s, m) => s + (m.plannedMinutes ?? 0), 0),
    overdueRevisions,
    overdueDeadlines,
    daysAway,
    examsSoon: exams,
  };
}

export type Backlog = Awaited<ReturnType<typeof getBacklog>>;

export function suggestsRestart(b: Backlog) {
  return b.missedSessions >= 3 || b.overdueRevisions.length >= 3 || b.daysAway >= 5;
}

export async function applyRestart(userId: string, mode: RestartMode, at: Date) {
  const profile = await getProfile(userId);
  const backlog = await getBacklog(userId, at);
  await clearFuturePlan(userId, at);
  const examSubjects = new Set(backlog.examsSoon.map((s) => s.id));

  // Overdue revisions: skip them and re-spread one per topic from tomorrow.
  const perDay = mode === "FRESH_START" ? 2 : 1;
  const time = preferredStartTime(profile.preferredStudyTimes);
  const tomorrow = addDaysToKey(localDateKey(at, profile.timezone), 1);
  const seen = new Set<string>();
  let slot = 0;
  for (const r of backlog.overdueRevisions) {
    await prisma.revisionTask.update({ where: { id: r.id }, data: { status: "SKIPPED" } });
    if (r.calendarEventId) await prisma.calendarEvent.update({ where: { id: r.calendarEventId }, data: { status: "CANCELLED" } });
    if (seen.has(r.topicId)) continue;
    seen.add(r.topicId);
    if (mode === "EXAM_FIRST" && !examSubjects.has(r.topic.syllabus.subjectId)) continue;
    await scheduleRevision(userId, { topicId: r.topicId, dateKey: addDaysToKey(tomorrow, Math.floor(slot / perDay)), time, kind: r.kind }, at);
    slot++;
  }

  const plan = await applyPlan(
    userId,
    at,
    mode === "FRESH_START"
      ? { days: 7, gentleStart: { days: 3, factor: 0.6 } }
      : mode === "CATCH_UP"
        ? { days: 14 }
        : { days: 7, subjectIds: examSubjects.size ? [...examSubjects] : null },
  );
  await prisma.notification.create({
    data: {
      userId,
      kind: "RESTART",
      title: "Your fresh plan is ready",
      body: `${plan.created} sessions planned${slot ? ` and ${slot} revisions rescheduled` : ""}. Start small — one session today is a win.`,
      link: "/today",
      dueAt: at,
    },
  });
  await prisma.suggestedAction.create({
    data: { userId, origin: "RESTART", actionType: "RESTART", title: "Restarted the plan", reason: mode, payload: { mode, sessions: plan.created, revisions: slot }, status: "ACCEPTED", resolvedAt: at, createdAt: at },
  });
  return { sessions: plan.created, revisions: slot, overflow: plan.overflow };
}
