import "server-only";
import type { NotificationKind } from "@/generated/prisma/client";
import { expandOccurrences } from "@/lib/recurrence";
import { addDaysToKey, formatInTz, localDateKey, localTimeKey, parseHm, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { now } from "../clock";

/**
 * In-app reminders: event reminders, exam/deadline countdowns and planned-session nudges,
 * respecting the student's reminder frequency and quiet hours (10:30 pm – 6:30 am).
 */

export const QUIET_START = "22:30";
export const QUIET_END = "06:30";

/** Defers a notification that would land in quiet hours to the morning (unless the event is earlier). */
export function deferForQuietHours(fireAt: Date, eventStart: Date, tz: string) {
  const m = parseHm(localTimeKey(fireAt, tz));
  const inQuiet = m >= parseHm(QUIET_START) || m < parseHm(QUIET_END);
  if (!inQuiet) return fireAt;
  const key = localDateKey(fireAt, tz);
  const morning = zonedToUtc(m >= parseHm(QUIET_START) ? addDaysToKey(key, 1) : key, QUIET_END, tz);
  return morning < eventStart ? morning : fireAt;
}

const KIND_LABEL: Record<string, string> = { EXAM: "Exam", ASSIGNMENT: "Due", APPLICATION: "Application deadline", CLASS: "Class", REVISION: "Revision", STUDY: "Study session", FOCUS: "Focus session" };

export async function dispatchRemindersForUser(userId: string, at: Date) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!profile || profile.reminderFrequency === "OFF") return 0;
  const tz = profile.timezone;
  const windowEnd = new Date(at.getTime() + 2 * 86400000);
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      isDemo: false,
      OR: [{ rrule: null, startAt: { gte: new Date(at.getTime() - 3600_000), lt: windowEnd } }, { rrule: { not: null }, startAt: { lt: windowEnd } }],
    },
    include: { studySession: { select: { id: true, status: true } } },
  });
  let created = 0;
  const create = async (data: { kind: NotificationKind; title: string; body: string; link: string; dueAt: Date; dedupeKey: string }) => {
    const res = await prisma.notification.createMany({ data: [{ userId, ...data }], skipDuplicates: true });
    created += res.count;
  };

  for (const e of events) {
    const important = e.kind === "EXAM" || e.isDeadline;
    if (profile.reminderFrequency === "MINIMAL" && !important) continue;
    for (const occ of expandOccurrences(e, at, windowEnd)) {
      for (const minutes of e.reminderMinutes) {
        const fireAt = new Date(occ.start.getTime() - minutes * 60000);
        if (fireAt.getTime() > at.getTime() + 60_000 || fireAt.getTime() < at.getTime() - 30 * 60_000) continue;
        if (e.studySession && e.studySession.status !== "PLANNED") continue;
        const when = formatInTz(occ.start, tz, { weekday: "short", hour: "numeric", minute: "2-digit" });
        await create({
          kind: important ? "DEADLINE" : e.kind === "REVISION" ? "REVISION_DUE" : "REMINDER",
          title: `${KIND_LABEL[e.kind] ?? "Reminder"}: ${e.title}`,
          body: minutes >= 1440 ? `${e.isDeadline ? "Due" : "Starts"} ${when}.` : minutes > 0 ? `${e.isDeadline ? "Due" : "Starts"} at ${when}.` : "Now.",
          link: e.studySession ? `/study/${e.studySession.id}` : e.topicId && e.subjectId ? `/learn/${e.subjectId}/topics/${e.topicId}` : `/calendar?date=${localDateKey(occ.start, tz)}`,
          dueAt: deferForQuietHours(fireAt, occ.start, tz),
          dedupeKey: `event:${e.id}:${occ.start.getTime()}:${minutes}`,
        });
      }
    }
  }

  // Countdowns at 7, 3 and 1 days, delivered after 8 am local time.
  const localNow = parseHm(localTimeKey(at, tz));
  if (localNow >= 8 * 60 && localNow < parseHm(QUIET_START)) {
    const todayKey = localDateKey(at, tz);
    const countdownEvents = await prisma.calendarEvent.findMany({
      where: { userId, status: "CONFIRMED", isDemo: false, OR: [{ showCountdown: true }, { kind: "EXAM" }], startAt: { gte: at, lt: new Date(at.getTime() + 8 * 86400000) } },
    });
    for (const e of countdownEvents) {
      const days = Math.round((new Date(`${localDateKey(e.startAt, tz)}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86400000);
      if (![7, 3, 1].includes(days)) continue;
      await create({
        kind: "DEADLINE",
        title: `${e.title} in ${days} day${days === 1 ? "" : "s"}`,
        body: e.kind === "EXAM" ? "Check your revision plan — a little each day beats a last-minute rush." : "Plan when you'll finish it.",
        link: `/calendar?date=${localDateKey(e.startAt, tz)}`,
        dueAt: at,
        dedupeKey: `countdown:${e.id}:${days}`,
      });
    }
  }
  return created;
}

/** Periodic job: every student with something coming up, each at their own (possibly simulated) time. */
export async function dispatchAllReminders() {
  const realNow = new Date();
  const users = await prisma.calendarEvent.findMany({
    where: { status: "CONFIRMED", isDemo: false, OR: [{ startAt: { gte: new Date(realNow.getTime() - 86400000), lt: new Date(realNow.getTime() + 9 * 86400000) } }, { rrule: { not: null } }] },
    distinct: ["userId"],
    select: { userId: true },
  });
  const clocks = await prisma.testClock.findMany({ select: { userId: true } });
  const ids = new Set([...users.map((u) => u.userId), ...clocks.map((c) => c.userId)]);
  let total = 0;
  for (const userId of ids) total += await dispatchRemindersForUser(userId, await now(userId));
  return total;
}
