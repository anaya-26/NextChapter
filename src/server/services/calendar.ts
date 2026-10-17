import "server-only";
import type { CalendarEvent, CommitmentKind, EventKind, EventStatus } from "@/generated/prisma/client";
import { addDaysToKey, localDateKey, parseHm, formatHm, zonedToUtc } from "@/lib/time";
import { expandOccurrences } from "@/lib/recurrence";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { afterLocalEventChange, beforeLocalEventDelete } from "./calendar-sync";

export type AgendaSource = "LOCAL" | "PLANNER" | "GOOGLE" | "COMMITMENT" | "BUSY";

export type AgendaItem = {
  key: string;
  eventId: string | null;
  kind: EventKind | "COMMITMENT" | "BUSY";
  commitmentKind?: CommitmentKind;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  status: EventStatus | null;
  source: AgendaSource;
  recurring: boolean;
  rrule: string | null;
  isDeadline: boolean;
  showCountdown: boolean;
  location: string | null;
  description: string | null;
  topic: { id: string; title: string; subjectId: string } | null;
  subject: { id: string; name: string; color: string | null } | null;
  session: { id: string; status: string } | null;
  estimatedMinutes: number | null;
  reminderMinutes: number[];
  syncState: string | null;
  isDemo: boolean;
};

export type EventInput = {
  title: string;
  kind: EventKind;
  dateKey: string;
  startTime: string | null;
  durationMinutes: number;
  allDay: boolean;
  rrule: string | null;
  location?: string | null;
  description?: string | null;
  reminderMinutes: number[];
  showCountdown: boolean;
  isDeadline: boolean;
  estimatedMinutes?: number | null;
  topicId?: string | null;
  subjectId?: string | null;
  goalId?: string | null;
  applicationId?: string | null;
};

const eventInclude = {
  topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } },
  subject: { select: { id: true, name: true, color: true } },
  studySession: { select: { id: true, status: true } },
} as const;

/** Start/end instants for an event input in the student's time zone. */
export function eventTimes(input: Pick<EventInput, "dateKey" | "startTime" | "durationMinutes" | "allDay">, tz: string) {
  if (input.allDay || !input.startTime) {
    const start = zonedToUtc(input.dateKey, "00:00", tz);
    const days = Math.max(1, Math.round(input.durationMinutes / 1440));
    return { startAt: start, endAt: zonedToUtc(addDaysToKey(input.dateKey, days), "00:00", tz) };
  }
  const startAt = zonedToUtc(input.dateKey, input.startTime, tz);
  return { startAt, endAt: new Date(startAt.getTime() + Math.max(5, input.durationMinutes) * 60000) };
}

async function assertOwnedLinks(userId: string, input: Partial<EventInput>) {
  if (input.topicId && !(await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true } }))) throw new Error("Topic not found");
  if (input.subjectId && !(await prisma.subject.findFirst({ where: { id: input.subjectId, userId }, select: { id: true } }))) throw new Error("Subject not found");
  if (input.goalId && !(await prisma.goal.findFirst({ where: { id: input.goalId, userId }, select: { id: true } }))) throw new Error("Goal not found");
  if (input.applicationId && !(await prisma.application.findFirst({ where: { id: input.applicationId, userId }, select: { id: true } }))) throw new Error("Application not found");
}

export async function createEvent(userId: string, input: EventInput, opts: { source?: "LOCAL" | "PLANNER"; isDemo?: boolean } = {}) {
  await assertOwnedLinks(userId, input);
  const profile = await getProfile(userId);
  const { startAt, endAt } = eventTimes(input, profile.timezone);
  let subjectId = input.subjectId ?? null;
  if (input.topicId && !subjectId) {
    subjectId = (await prisma.topic.findUnique({ where: { id: input.topicId }, select: { syllabus: { select: { subjectId: true } } } }))?.syllabus.subjectId ?? null;
  }
  const event = await prisma.calendarEvent.create({
    data: {
      userId,
      title: input.title,
      kind: input.kind,
      startAt,
      endAt,
      allDay: input.allDay,
      timezone: profile.timezone,
      rrule: input.rrule,
      location: input.location ?? null,
      description: input.description ?? null,
      reminderMinutes: input.reminderMinutes,
      showCountdown: input.showCountdown,
      isDeadline: input.isDeadline,
      estimatedMinutes: input.estimatedMinutes ?? null,
      topicId: input.topicId ?? null,
      subjectId,
      goalId: input.goalId ?? null,
      applicationId: input.applicationId ?? null,
      source: opts.source ?? "LOCAL",
      isDemo: opts.isDemo ?? false,
    },
  });
  await afterLocalEventChange(userId, event.id);
  return event;
}

export async function updateEvent(userId: string, eventId: string, input: EventInput) {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId } });
  if (!existing) throw new Error("Event not found");
  await assertOwnedLinks(userId, input);
  const { startAt, endAt } = eventTimes(input, existing.timezone);
  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: input.title,
      kind: input.kind,
      startAt,
      endAt,
      allDay: input.allDay,
      rrule: input.rrule,
      location: input.location ?? null,
      description: input.description ?? null,
      reminderMinutes: input.reminderMinutes,
      showCountdown: input.showCountdown,
      isDeadline: input.isDeadline,
      estimatedMinutes: input.estimatedMinutes ?? null,
      topicId: input.topicId ?? existing.topicId,
      subjectId: input.subjectId ?? existing.subjectId,
    },
  });
  // Keep a linked planned session in step with its event.
  await prisma.studySession.updateMany({
    where: { calendarEventId: eventId, userId, status: "PLANNED" },
    data: { plannedStart: startAt, plannedMinutes: Math.round((endAt.getTime() - startAt.getTime()) / 60000), title: input.title },
  });
  await afterLocalEventChange(userId, event.id);
  return event;
}

export async function deleteEvent(userId: string, eventId: string) {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId } });
  if (!existing) return false;
  await beforeLocalEventDelete(userId, existing);
  await prisma.studySession.deleteMany({ where: { calendarEventId: eventId, userId, status: "PLANNED" } });
  await prisma.calendarEvent.delete({ where: { id: eventId } });
  return true;
}

export async function setEventStatus(userId: string, eventId: string, status: EventStatus) {
  const res = await prisma.calendarEvent.updateMany({ where: { id: eventId, userId }, data: { status } });
  if (res.count) await afterLocalEventChange(userId, eventId);
  return res.count === 1;
}

export async function getEvent(userId: string, eventId: string) {
  return prisma.calendarEvent.findFirst({ where: { id: eventId, userId }, include: eventInclude });
}

type EventWithLinks = CalendarEvent & {
  topic: { id: string; title: string; syllabus: { subjectId: string } } | null;
  subject: { id: string; name: string; color: string | null } | null;
  studySession: { id: string; status: string } | null;
};

function toItem(e: EventWithLinks, occ: { start: Date; end: Date }): AgendaItem {
  return {
    key: `${e.id}:${occ.start.getTime()}`,
    eventId: e.id,
    kind: e.kind,
    title: e.title,
    start: occ.start,
    end: occ.end,
    allDay: e.allDay,
    status: e.status,
    source: e.source,
    recurring: !!e.rrule,
    rrule: e.rrule,
    isDeadline: e.isDeadline,
    showCountdown: e.showCountdown,
    location: e.location,
    description: e.description,
    topic: e.topic ? { id: e.topic.id, title: e.topic.title, subjectId: e.topic.syllabus.subjectId } : null,
    subject: e.subject,
    session: e.studySession,
    estimatedMinutes: e.estimatedMinutes,
    reminderMinutes: e.reminderMinutes,
    syncState: e.syncState,
    isDemo: e.isDemo,
  };
}

/** Every event occurrence, class/commitment block and Google busy block between two instants. */
export async function listAgenda(userId: string, from: Date, to: Date, opts: { includeCancelled?: boolean; tz?: string } = {}) {
  const tz = opts.tz ?? (await getProfile(userId)).timezone;
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      ...(opts.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
      OR: [{ rrule: null, startAt: { lt: to }, endAt: { gt: from } }, { rrule: { not: null }, startAt: { lt: to } }],
    },
    include: eventInclude,
    orderBy: { startAt: "asc" },
  });
  const items: AgendaItem[] = [];
  for (const e of events) for (const occ of expandOccurrences(e, from, to)) items.push(toItem(e, occ));

  const commitments = await prisma.commitment.findMany({ where: { userId, active: true } });
  const firstKey = localDateKey(new Date(from.getTime() - 86400000), tz);
  const lastKey = localDateKey(to, tz);
  for (let key = firstKey; key <= lastKey; key = addDaysToKey(key, 1)) {
    const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
    for (const c of commitments) {
      if (!c.daysOfWeek.includes(weekday)) continue;
      const start = zonedToUtc(key, c.startTime, tz);
      const overnight = parseHm(c.endTime) <= parseHm(c.startTime);
      const end = zonedToUtc(overnight ? addDaysToKey(key, 1) : key, c.endTime, tz);
      if (start >= to || end <= from) continue;
      items.push({
        key: `commitment:${c.id}:${key}`,
        eventId: null,
        kind: "COMMITMENT",
        commitmentKind: c.kind,
        title: c.title,
        start,
        end,
        allDay: false,
        status: null,
        source: "COMMITMENT",
        recurring: true,
        rrule: null,
        isDeadline: false,
        showCountdown: false,
        location: c.location,
        description: c.flexible ? "Flexible" : null,
        topic: null,
        subject: null,
        session: null,
        estimatedMinutes: null,
        reminderMinutes: [],
        syncState: null,
        isDemo: false,
      });
    }
  }

  const busy = await prisma.busyBlock.findMany({ where: { userId, startAt: { lt: to }, endAt: { gt: from } } });
  for (const b of busy) {
    items.push({
      key: `busy:${b.id}`,
      eventId: null,
      kind: "BUSY",
      title: "Busy (Google Calendar)",
      start: b.startAt,
      end: b.endAt,
      allDay: false,
      status: null,
      source: "BUSY",
      recurring: false,
      rrule: null,
      isDeadline: false,
      showCountdown: false,
      location: null,
      description: null,
      topic: null,
      subject: null,
      session: null,
      estimatedMinutes: null,
      reminderMinutes: [],
      syncState: null,
      isDemo: false,
    });
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
}

/** Items that block time (deadlines, reminders and all-day markers don't). */
export function occupiesTime(item: AgendaItem) {
  return !item.allDay && !item.isDeadline && item.kind !== "REMINDER" && item.status !== "CANCELLED" && item.status !== "DONE";
}

export async function findConflicts(userId: string, start: Date, end: Date, opts: { excludeEventId?: string | null } = {}) {
  const items = await listAgenda(userId, new Date(start.getTime() - 86400000), new Date(end.getTime() + 86400000));
  return items.filter((i) => occupiesTime(i) && i.eventId !== opts.excludeEventId && i.start < end && i.end > start);
}

export type Countdown = { key: string; title: string; at: Date; daysLeft: number; kind: string; href: string };

/** Upcoming exams and deadlines the student wants to count down to. */
export async function countdowns(userId: string, at: Date, horizonDays = 90): Promise<Countdown[]> {
  const profile = await getProfile(userId);
  const until = new Date(at.getTime() + horizonDays * 86400000);
  const events = await prisma.calendarEvent.findMany({
    where: { userId, status: "CONFIRMED", startAt: { gte: at, lt: until }, OR: [{ showCountdown: true }, { kind: "EXAM" }] },
    orderBy: { startAt: "asc" },
    take: 12,
  });
  const subjects = await prisma.subject.findMany({ where: { userId, status: "ACTIVE", examDate: { gte: at, lt: until } } });
  const todayKey = localDateKey(at, profile.timezone);
  const days = (d: Date) => Math.max(0, Math.round((new Date(`${localDateKey(d, profile.timezone)}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86400000));
  const out: Countdown[] = [
    ...events.map((e) => ({ key: e.id, title: e.title, at: e.startAt, daysLeft: days(e.startAt), kind: e.kind, href: `/calendar?date=${localDateKey(e.startAt, profile.timezone)}` })),
    ...subjects
      .filter((s) => !events.some((e) => e.kind === "EXAM" && e.subjectId === s.id))
      .map((s) => ({ key: `subject:${s.id}`, title: `${s.name} exam`, at: s.examDate!, daysLeft: days(s.examDate!), kind: "EXAM", href: `/learn/${s.id}` })),
  ];
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 8);
}

/* ── iCalendar export ─────────────────────────────────────────────── */

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsLocal(d: Date, tz: string) {
  return `${localDateKey(d, tz).replace(/-/g, "")}T${formatHm(Math.round((d.getTime() - zonedToUtc(localDateKey(d, tz), "00:00", tz).getTime()) / 60000)).replace(":", "")}00`;
}

/** The student's NextChapter calendar as an .ics file (works with any calendar app, no account link needed). */
export async function exportIcs(userId: string, at: Date) {
  const events = await prisma.calendarEvent.findMany({
    where: { userId, status: { not: "CANCELLED" }, OR: [{ endAt: { gte: new Date(at.getTime() - 30 * 86400000) } }, { rrule: { not: null } }] },
    orderBy: { startAt: "asc" },
  });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NextChapter//Student Companion//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:NextChapter study plan"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@nextchapter`, `DTSTAMP:${icsUtc(e.updatedAt)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${localDateKey(e.startAt, e.timezone).replace(/-/g, "")}`, `DTEND;VALUE=DATE:${localDateKey(e.endAt, e.timezone).replace(/-/g, "")}`);
    } else if (e.rrule) {
      lines.push(`DTSTART;TZID=${e.timezone}:${icsLocal(e.startAt, e.timezone)}`, `DTEND;TZID=${e.timezone}:${icsLocal(e.endAt, e.timezone)}`, `RRULE:${e.rrule}`);
    } else {
      lines.push(`DTSTART:${icsUtc(e.startAt)}`, `DTEND:${icsUtc(e.endAt)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`, `CATEGORIES:${e.kind}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    for (const m of e.reminderMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${m}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map((l) => (l.length > 74 ? l.match(/.{1,74}/g)!.join("\r\n ") : l)).join("\r\n") + "\r\n";
}
