import "server-only";
import { nextStep } from "@/lib/roadmap";
import { addDaysToKey, localDateKey, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { countdowns, listAgenda, type AgendaItem } from "./calendar";
import { autoMarkMissed, detectMissedPattern } from "./sessions";
import { dueRevisions } from "./revision";
import { getBacklog, suggestsRestart } from "./restart";
import { weekLoad } from "./planner";

export type PrimaryAction =
  | { type: "CONTINUE"; title: string; href: string; detail: string }
  | { type: "START_SESSION"; title: string; sessionId: string; detail: string }
  | { type: "LINK"; title: string; href: string; detail: string; label: string }
  | { type: "PLAN"; title: string; detail: string };

/** Everything the Today page needs: one clear start action and a few priorities. */
export async function todayOverview(userId: string, at: Date) {
  await autoMarkMissed(userId, at);
  await detectMissedPattern(userId, at);
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const todayKey = localDateKey(at, tz);
  const dayStart = zonedToUtc(todayKey, "00:00", tz);
  const tomorrowEnd = zonedToUtc(addDaysToKey(todayKey, 2), "00:00", tz);
  const dayEnd = zonedToUtc(addDaysToKey(todayKey, 1), "00:00", tz);

  const [agenda, inProgress, revisions, cardsDue, subjects, upcoming, backlog, obstacles, welcome, load] = await Promise.all([
    listAgenda(userId, dayStart, tomorrowEnd, { tz }),
    prisma.studySession.findFirst({ where: { userId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } }),
    dueRevisions(userId, at),
    prisma.flashcard.count({ where: { userId, suspended: false, due: { lte: at } } }),
    prisma.subject.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: [{ examDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: { syllabi: { where: { status: "CONFIRMED" }, include: { topics: { include: { prerequisites: true } } } } },
    }),
    countdowns(userId, at, 60),
    getBacklog(userId, at),
    prisma.suggestedAction.findMany({ where: { userId, actionType: "OBSTACLE_DISCUSSION", status: "PROPOSED" }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.xpEvent.findFirst({ where: { userId, action: "RETURN_AFTER_BREAK", occurredOn: new Date(`${todayKey}T00:00:00Z`) } }),
    weekLoad(userId, at),
  ]);

  const steps = subjects
    .map((s) => {
      const topics = s.syllabi.flatMap((y) => y.topics);
      const step = nextStep(topics.map((t) => ({ ...t, prerequisiteIds: t.prerequisites.map((p) => p.prerequisiteId) })));
      return step ? { subject: s, ...step } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const today = agenda.filter((a) => a.start < dayEnd && a.end > dayStart);
  const studyToday = today.filter((a) => a.session && a.session.status === "PLANNED").sort((a, b) => a.start.getTime() - b.start.getTime());
  const soon = studyToday.find((a) => a.start.getTime() - at.getTime() < 2 * 3600_000);

  let primary: PrimaryAction;
  if (inProgress) {
    primary = { type: "CONTINUE", title: `Continue: ${inProgress.title ?? "your session"}`, href: `/study/${inProgress.id}`, detail: "You have a session running." };
  } else if (soon) {
    primary = { type: "START_SESSION", title: soon.title, sessionId: soon.session!.id, detail: `${soon.start < at ? "Planned for" : "Starts at"} ${timeOf(soon.start, tz)} · ${minutes(soon)} min` };
  } else if (revisions.length) {
    const r = revisions[0];
    primary = { type: "LINK", title: `Revise: ${r.topic.title}`, href: `/learn/${r.topic.syllabus.subjectId}/topics/${r.topic.id}?tab=revise`, detail: "Spaced revision is due — recall first, then check.", label: "Start revising" };
  } else if (studyToday.length) {
    const n = studyToday[0];
    primary = { type: "START_SESSION", title: n.title, sessionId: n.session!.id, detail: `Planned for ${timeOf(n.start, tz)} — you can start early.` };
  } else if (steps.length) {
    const s = steps[0];
    primary = { type: "LINK", title: s.topic.title, href: `/learn/${s.subject.id}/topics/${s.topic.id}`, detail: `${s.subject.name} · ${s.reason}`, label: "Start" };
  } else if (cardsDue) {
    primary = { type: "LINK", title: `Review ${cardsDue} flashcard${cardsDue === 1 ? "" : "s"}`, href: "/learn/review", detail: "A few minutes of recall keeps things fresh.", label: "Review" };
  } else {
    primary = { type: "PLAN", title: subjects.length ? "Plan your week" : "Add your first subject", detail: subjects.length ? "NextChapter will fit study time around your classes." : "Then add its syllabus — a photo is enough." };
  }

  const remaining = agenda
    .filter((a) => a.kind !== "BUSY" && a.end > at && !(a.session && a.session.status !== "PLANNED") && a.status !== "DONE")
    .filter((a) => (a.isDeadline || a.kind === "EXAM" ? a.start < tomorrowEnd : a.start < dayEnd))
    .filter((a) => !(primary.type === "START_SESSION" && a.session?.id === primary.sessionId));

  return {
    tz,
    todayKey,
    primary,
    priorities: remaining.filter((a) => a.kind !== "COMMITMENT").slice(0, 3),
    morePriorities: Math.max(0, remaining.filter((a) => a.kind !== "COMMITMENT").length - 3),
    commitmentsToday: remaining.filter((a) => a.kind === "COMMITMENT"),
    revisions,
    cardsDue,
    upcoming,
    restart: suggestsRestart(backlog) ? backlog : null,
    obstacle: obstacles[0] ?? null,
    welcomeBack: !!welcome,
    load,
    nextSteps: steps.slice(0, 3),
  };
}

function timeOf(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

function minutes(a: AgendaItem) {
  return Math.round((a.end.getTime() - a.start.getTime()) / 60000);
}
