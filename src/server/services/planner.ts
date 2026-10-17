import "server-only";
import { addDaysToKey, localDateKey, zonedToUtc } from "@/lib/time";
import { DAY_PARTS, paceFactor, planSchedule, type DayFrame, type PlanResult, type PlanTask } from "@/lib/planner";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { listAgenda, occupiesTime } from "./calendar";
import { beforeLocalEventDelete, afterLocalEventChange } from "./calendar-sync";

export type PlanOptions = {
  days?: number;
  /** Extra minutes per day on top of the student's usual cap. */
  extraMinutesPerDay?: number;
  /** Plan only for these subjects (e.g. exams first). */
  subjectIds?: string[] | null;
  /** Topics already covered by materials or in progress get half the time (a quick review). */
  quickReview?: boolean;
  /** Leave topics without a deadline for later; plan deadline work only. */
  deadlinesOnly?: boolean;
  includeOptional?: boolean;
  /** A gentler start after a break: the first N days use this fraction of the cap. */
  gentleStart?: { days: number; factor: number } | null;
  /** Preview a re-plan: ignore future sessions the planner already created. */
  ignoreExistingPlan?: boolean;
};

export type PlanChoice = {
  id: "MORE_TIME" | "LONGER" | "QUICK_REVIEW" | "DEADLINES_ONLY";
  label: string;
  detail: string;
  options: PlanOptions;
  overflowMinutes: number;
};

const DEFAULT_CAP = 120;

/** The student's usual daily study cap in minutes. */
export function dailyCap(weeklyHoursTarget: number | null | undefined) {
  if (!weeklyHoursTarget) return DEFAULT_CAP;
  return Math.max(30, Math.min(480, Math.round((weeklyHoursTarget * 60) / 7 / 5) * 5));
}

/**
 * Study windows for a day: preferred parts of the day first; early morning and night only if
 * preferred. Without preferences, evenings come first and weekday mornings last (school or
 * college hours for most students, unless their commitments say otherwise).
 */
export function studyWindows(dateKey: string, tz: string, preferred: string[]) {
  const weekend = [0, 6].includes(new Date(`${dateKey}T00:00:00Z`).getUTCDay());
  const defaults: Record<string, number> = { EVENING: 2, AFTERNOON: 1, MORNING: weekend ? 1 : 0.5 };
  return DAY_PARTS.filter((p) => preferred.includes(p.id) || (p.id !== "EARLY_MORNING" && p.id !== "NIGHT")).map((p) => ({
    start: zonedToUtc(dateKey, p.start, tz).getTime(),
    end: zonedToUtc(dateKey, p.end, tz).getTime(),
    pref: preferred.length ? (preferred.includes(p.id) ? 2 : 0) : (defaults[p.id] ?? 0),
  }));
}

export async function studentPace(userId: string) {
  const sessions = await prisma.studySession.findMany({
    where: { userId, status: { in: ["COMPLETED", "PARTIAL"] }, plannedMinutes: { not: null }, actualMinutes: { not: null } },
    orderBy: { endedAt: "desc" },
    take: 30,
    select: { plannedMinutes: true, actualMinutes: true },
  });
  return paceFactor(sessions);
}

/** Work that needs time: next roadmap topics, assignment deadlines and exam revision. */
export async function gatherTasks(userId: string, at: Date, horizonEnd: Date, opts: PlanOptions = {}) {
  const pace = await studentPace(userId);
  const subjects = await prisma.subject.findMany({
    where: { userId, status: "ACTIVE", ...(opts.subjectIds?.length ? { id: { in: opts.subjectIds } } : {}) },
    include: {
      syllabi: {
        where: { status: "CONFIRMED" },
        include: { topics: { where: { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, orderBy: { order: "asc" } } },
      },
    },
  });
  const sessions = await prisma.studySession.findMany({
    where: { userId, OR: [{ status: { in: ["COMPLETED", "PARTIAL"] } }, ...(opts.ignoreExistingPlan ? [] : [{ status: "PLANNED" as const, plannedStart: { gte: at } }])] },
    select: { topicId: true, targetEventId: true, status: true, actualMinutes: true, plannedMinutes: true },
  });
  const spentOn = (match: (s: (typeof sessions)[number]) => boolean) =>
    sessions.filter(match).reduce((sum, s) => sum + (s.status === "PLANNED" ? (s.plannedMinutes ?? 0) : (s.actualMinutes ?? 0)), 0);

  const tasks: PlanTask[] = [];
  const assumptions: string[] = [];
  for (const subject of subjects) {
    const examDue = subject.examDate ? zonedToUtc(localDateKey(subject.examDate), "00:00").getTime() : null;
    if (opts.deadlinesOnly && !examDue) continue;
    let count = 0;
    for (const topic of subject.syllabi.flatMap((s) => s.topics)) {
      if (topic.kind === "OPTIONAL" && !opts.includeOptional) continue;
      if (count >= 8) break;
      const base = (topic.estimatedMinutes ?? 60) * pace.factor * (opts.quickReview && (topic.coverage === "COVERED" || topic.status === "IN_PROGRESS") ? 0.5 : 1);
      const left = Math.round(base - spentOn((s) => s.topicId === topic.id));
      if (left < 10) continue;
      tasks.push({
        id: `topic:${topic.id}`,
        title: topic.title,
        minutes: left,
        dueAt: examDue,
        priority: topic.kind === "OPTIONAL" ? 0 : 2,
        kind: "TOPIC",
        topicId: topic.id,
        subjectId: subject.id,
        optional: topic.kind === "OPTIONAL",
      });
      count++;
    }
  }
  const deadlines = await prisma.calendarEvent.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      startAt: { gt: at, lt: new Date(horizonEnd.getTime() + 14 * 86400000) },
      OR: [{ kind: { in: ["ASSIGNMENT", "PROJECT", "APPLICATION"] }, isDeadline: true }, { kind: "EXAM" }],
      ...(opts.subjectIds?.length ? { subjectId: { in: opts.subjectIds } } : {}),
    },
  });
  for (const d of deadlines) {
    const isExam = d.kind === "EXAM";
    const needed = d.estimatedMinutes ?? (isExam ? 120 : 60);
    if (!d.estimatedMinutes && !isExam) assumptions.push(`“${d.title}” has no time estimate — assumed 1 hour.`);
    const left = Math.round(needed * (isExam ? 1 : pace.factor) - spentOn((s) => s.targetEventId === d.id));
    if (left < 10) continue;
    tasks.push({
      id: `event:${d.id}`,
      title: isExam ? `Exam revision: ${d.title}` : `Work on: ${d.title}`,
      minutes: left,
      dueAt: d.startAt.getTime(),
      priority: 3,
      kind: isExam ? "EXAM_PREP" : "ASSIGNMENT",
      subjectId: d.subjectId,
      topicId: d.topicId,
      targetEventId: d.id,
    });
  }
  return { tasks, pace, assumptions };
}

/** Builds a plan without saving anything. */
export async function buildPlan(userId: string, at: Date, opts: PlanOptions = {}) {
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const days = opts.days ?? 7;
  const todayKey = localDateKey(at, tz);
  const horizonEnd = zonedToUtc(addDaysToKey(todayKey, days), "00:00", tz);
  const agenda = (await listAgenda(userId, at, horizonEnd, { tz })).filter((a) => !(opts.ignoreExistingPlan && a.source === "PLANNER" && a.session?.status === "PLANNED"));
  const busy = agenda.filter(occupiesTime).map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }));
  const cap = dailyCap(profile.weeklyStudyHoursTarget) + (opts.extraMinutesPerDay ?? 0);
  const studyKinds = new Set(["STUDY", "REVISION", "FOCUS"]);
  const frames: DayFrame[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(todayKey, i);
    const existing = agenda
      .filter((a) => studyKinds.has(a.kind) && localDateKey(a.start, tz) === key && a.status !== "CANCELLED" && a.session?.status !== "MISSED")
      .reduce((s, a) => s + Math.round((a.end.getTime() - a.start.getTime()) / 60000), 0);
    const factor = opts.gentleStart && i < opts.gentleStart.days ? opts.gentleStart.factor : 1;
    frames.push({ dateKey: key, windows: studyWindows(key, tz, profile.preferredStudyTimes), capMinutes: Math.round(cap * factor), existingMinutes: existing });
  }
  const { tasks, pace, assumptions } = await gatherTasks(userId, at, horizonEnd, opts);
  const result = planSchedule({ now: at.getTime(), days: frames, busy, tasks });
  return { result, tasks, pace, cap, days, timezone: tz, assumptions };
}

/** A plan plus, when everything doesn't fit, a few concrete choices with their effect. */
export async function proposePlan(userId: string, at: Date, opts: PlanOptions = {}) {
  const plan = await buildPlan(userId, at, opts);
  const overflow = plan.result.overflow.reduce((s, o) => s + o.minutes, 0);
  const choices: PlanChoice[] = [];
  if (overflow > 0) {
    const days = plan.days;
    const extra = Math.min(90, Math.ceil(overflow / days / 15) * 15);
    const variants: Omit<PlanChoice, "overflowMinutes">[] = [
      { id: "MORE_TIME", label: `Study ${extra} more minutes a day`, detail: `Raises your daily limit from ${plan.cap} to ${plan.cap + extra} minutes this week.`, options: { ...opts, extraMinutesPerDay: (opts.extraMinutesPerDay ?? 0) + extra } },
      { id: "QUICK_REVIEW", label: "Quick review for topics you've started or have notes for", detail: "Halves the time for topics already covered by your materials or in progress.", options: { ...opts, quickReview: true } },
      { id: "LONGER", label: "Spread it over two weeks", detail: "Work without a deadline this week moves into next week.", options: { ...opts, days: Math.max(14, days) } },
      { id: "DEADLINES_ONLY", label: "Deadlines and exams first", detail: "Plans only work with a deadline or exam date; other topics wait.", options: { ...opts, deadlinesOnly: true } },
    ];
    for (const v of variants) {
      const r = await buildPlan(userId, at, v.options);
      const left = r.result.overflow.reduce((s, o) => s + o.minutes, 0);
      if (left < overflow) choices.push({ ...v, overflowMinutes: left });
    }
  }
  return { ...plan, overflowMinutes: overflow, choices };
}

function blockTitle(task: PlanTask | undefined, fallback: string) {
  return task ? task.title : fallback;
}

/** Saves a plan as planned sessions on the calendar (after the student agrees). */
export async function applyPlan(userId: string, at: Date, opts: PlanOptions = {}) {
  const plan = await buildPlan(userId, at, opts);
  const profile = await getProfile(userId);
  const reminders = profile.reminderFrequency === "OFF" || profile.reminderFrequency === "MINIMAL" ? [] : [10];
  let created = 0;
  for (const block of plan.result.blocks) {
    const task = plan.tasks.find((t) => t.id === block.taskId);
    const event = await prisma.calendarEvent.create({
      data: {
        userId,
        title: blockTitle(task, block.title),
        kind: "STUDY",
        startAt: new Date(block.start),
        endAt: new Date(block.end),
        timezone: profile.timezone,
        topicId: task?.topicId ?? null,
        subjectId: task?.subjectId ?? null,
        estimatedMinutes: block.minutes,
        reminderMinutes: reminders,
        source: "PLANNER",
      },
    });
    await prisma.studySession.create({
      data: {
        userId,
        title: event.title,
        kind: task?.kind === "EXAM_PREP" ? "REVISION" : "STUDY",
        status: "PLANNED",
        plannedStart: event.startAt,
        plannedMinutes: block.minutes,
        topicId: task?.topicId ?? null,
        subjectId: task?.subjectId ?? null,
        targetEventId: task?.targetEventId ?? null,
        calendarEventId: event.id,
      },
    });
    await afterLocalEventChange(userId, event.id);
    created++;
  }
  return { created, overflow: plan.result.overflow };
}

/** Removes future planned sessions the planner created (not ones already started or done). */
export async function clearFuturePlan(userId: string, at: Date) {
  const sessions = await prisma.studySession.findMany({
    where: { userId, status: "PLANNED", plannedStart: { gt: at }, calendarEvent: { source: "PLANNER" } },
    include: { calendarEvent: true },
  });
  for (const s of sessions) {
    if (s.calendarEvent) await beforeLocalEventDelete(userId, s.calendarEvent);
  }
  const eventIds = sessions.map((s) => s.calendarEventId).filter((id): id is string => !!id);
  await prisma.studySession.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds }, userId } });
  return sessions.length;
}

/** This week's planned vs completed study minutes. */
export async function weekLoad(userId: string, at: Date) {
  const profile = await getProfile(userId);
  const todayKey = localDateKey(at, profile.timezone);
  const weekday = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const startKey = addDaysToKey(todayKey, weekday === 0 ? -6 : 1 - weekday);
  const start = zonedToUtc(startKey, "00:00", profile.timezone);
  const end = zonedToUtc(addDaysToKey(startKey, 7), "00:00", profile.timezone);
  const sessions = await prisma.studySession.findMany({
    where: { userId, OR: [{ plannedStart: { gte: start, lt: end } }, { startedAt: { gte: start, lt: end } }] },
    select: { status: true, plannedMinutes: true, actualMinutes: true },
  });
  return {
    plannedMinutes: sessions.reduce((s, x) => s + (x.plannedMinutes ?? 0), 0),
    doneMinutes: sessions.filter((x) => x.status === "COMPLETED" || x.status === "PARTIAL").reduce((s, x) => s + (x.actualMinutes ?? 0), 0),
    missed: sessions.filter((x) => x.status === "MISSED").length,
    capWeek: dailyCap(profile.weeklyStudyHoursTarget) * 7,
  };
}

export type { PlanResult };
