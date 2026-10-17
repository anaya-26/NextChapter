import "server-only";
import { BADGES, levelForXp, XP_RULES } from "@/lib/xp-rules";
import { addDaysToKey, localDateKey, weekStartKey, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { recurringDifficulties } from "./mistakes";

export type WeekPoint = { weekKey: string; plannedMinutes: number; actualMinutes: number; accuracy: number | null; attempts: number; recall: number | null; revisions: number };

/** Everything for My Progress: XP and level, badges, real improvement and consistency. */
export async function progressOverview(userId: string, at: Date, weeks = 8) {
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const todayKey = localDateKey(at, tz);
  const thisWeek = weekStartKey(todayKey);
  const firstWeek = addDaysToKey(thisWeek, -7 * (weeks - 1));
  const from = zonedToUtc(firstWeek, "00:00", tz);
  const heatFromKey = addDaysToKey(thisWeek, -7 * 11);
  const heatFrom = zonedToUtc(heatFromKey, "00:00", tz);

  const [xpAgg, recentXp, badges, sessions, attempts, revisions, xpDays, subjects, recurring, returns, demoCount] = await Promise.all([
    prisma.xpEvent.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.xpEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.userBadge.findMany({ where: { userId }, orderBy: { awardedAt: "asc" } }),
    prisma.studySession.findMany({
      where: { userId, OR: [{ plannedStart: { gte: heatFrom } }, { startedAt: { gte: heatFrom } }] },
      select: { plannedStart: true, startedAt: true, plannedMinutes: true, actualMinutes: true, status: true },
    }),
    prisma.practiceAttempt.findMany({ where: { userId, attemptedAt: { gte: from }, score: { not: null } }, select: { attemptedAt: true, score: true } }),
    prisma.revisionTask.findMany({ where: { userId, status: "DONE", completedAt: { gte: from } }, select: { completedAt: true, recallScore: true } }),
    prisma.xpEvent.findMany({ where: { userId, occurredOn: { gte: new Date(`${heatFromKey}T00:00:00Z`) } }, select: { occurredOn: true } }),
    prisma.subject.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true, name: true, isDemo: true, syllabi: { where: { status: "CONFIRMED" }, select: { topics: { select: { kind: true, status: true, studiedAt: true, understandingCheckedAt: true, lastRevisedAt: true } } } } },
    }),
    recurringDifficulties(userId),
    prisma.xpEvent.count({ where: { userId, action: "RETURN_AFTER_BREAK" } }),
    prisma.xpEvent.count({ where: { userId, isDemo: true } }),
  ]);

  const total = xpAgg._sum.points ?? 0;
  const weekOf = (d: Date) => weekStartKey(localDateKey(d, tz));
  const series: WeekPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const key = addDaysToKey(firstWeek, 7 * i);
    const s = sessions.filter((x) => (x.plannedStart ?? x.startedAt) && weekOf((x.plannedStart ?? x.startedAt)!) === key);
    const a = attempts.filter((x) => weekOf(x.attemptedAt) === key);
    const r = revisions.filter((x) => x.completedAt && weekOf(x.completedAt) === key && x.recallScore != null);
    series.push({
      weekKey: key,
      plannedMinutes: s.filter((x) => x.plannedStart).reduce((acc, x) => acc + (x.plannedMinutes ?? 0), 0),
      actualMinutes: s.filter((x) => x.status === "COMPLETED" || x.status === "PARTIAL").reduce((acc, x) => acc + (x.actualMinutes ?? 0), 0),
      accuracy: a.length ? a.reduce((acc, x) => acc + x.score!, 0) / a.length : null,
      attempts: a.length,
      recall: r.length ? r.reduce((acc, x) => acc + x.recallScore!, 0) / r.length : null,
      revisions: r.length,
    });
  }

  // Activity heatmap: minutes studied per day for 12 weeks; days with any XP count as active.
  const minutesByDay = new Map<string, number>();
  for (const s of sessions) {
    if (!(s.status === "COMPLETED" || s.status === "PARTIAL") || !s.startedAt) continue;
    const k = localDateKey(s.startedAt, tz);
    minutesByDay.set(k, (minutesByDay.get(k) ?? 0) + (s.actualMinutes ?? 0));
  }
  const activeDays = new Set(xpDays.map((x) => x.occurredOn.toISOString().slice(0, 10)));
  const heat: { dateKey: string; minutes: number; active: boolean; future: boolean }[] = [];
  for (let k = heatFromKey; k <= addDaysToKey(thisWeek, 6); k = addDaysToKey(k, 1)) {
    heat.push({ dateKey: k, minutes: minutesByDay.get(k) ?? 0, active: activeDays.has(k) || (minutesByDay.get(k) ?? 0) > 0, future: k > todayKey });
  }
  const last14 = heat.filter((h) => !h.future && h.dateKey > addDaysToKey(todayKey, -14)).filter((h) => h.active).length;

  // Real improvement: last four weeks vs the four before, only with enough data.
  const half = (from: number, to: number, pick: (w: WeekPoint) => { v: number | null; n: number }) => {
    const ws = series.slice(from, to).map(pick).filter((x) => x.v != null && x.n > 0);
    const n = ws.reduce((a, x) => a + x.n, 0);
    return { value: n ? ws.reduce((a, x) => a + x.v! * x.n, 0) / n : null, n };
  };
  const improvements: string[] = [];
  const acc = [half(0, weeks / 2, (w) => ({ v: w.accuracy, n: w.attempts })), half(weeks / 2, weeks, (w) => ({ v: w.accuracy, n: w.attempts }))];
  if (acc[0].n >= 5 && acc[1].n >= 5 && acc[0].value != null && acc[1].value != null && Math.abs(acc[1].value - acc[0].value) >= 0.05) {
    improvements.push(`Practice accuracy ${acc[1].value > acc[0].value ? "rose" : "dipped"} from ${Math.round(acc[0].value * 100)}% to ${Math.round(acc[1].value * 100)}% (last 4 weeks vs the 4 before).`);
  }
  const rec = [half(0, weeks / 2, (w) => ({ v: w.recall, n: w.revisions })), half(weeks / 2, weeks, (w) => ({ v: w.recall, n: w.revisions }))];
  if (rec[0].n >= 3 && rec[1].n >= 3 && rec[0].value != null && rec[1].value != null && Math.abs(rec[1].value - rec[0].value) >= 0.05) {
    improvements.push(`Recall at revision ${rec[1].value > rec[0].value ? "improved" : "dropped"} from ${Math.round(rec[0].value * 100)}% to ${Math.round(rec[1].value * 100)}%.`);
  }

  const topicStats = subjects.map((s) => {
    const topics = s.syllabi.flatMap((y) => y.topics).filter((t) => t.kind !== "OPTIONAL" && t.status !== "SKIPPED");
    return {
      id: s.id,
      name: s.name,
      isDemo: s.isDemo,
      total: topics.length,
      studied: topics.filter((t) => t.studiedAt || t.status === "STUDIED").length,
      checked: topics.filter((t) => t.understandingCheckedAt).length,
      revised: topics.filter((t) => t.lastRevisedAt).length,
    };
  });

  return {
    xp: { total, ...levelForXp(total) },
    recentXp: recentXp.map((x) => ({ id: x.id, points: x.points, reason: x.reason, action: x.action, label: XP_RULES[x.action].label, at: x.createdAt, isDemo: x.isDemo })),
    badges: BADGES.map((b) => ({ ...b, awardedAt: badges.find((u) => u.badgeCode === b.code)?.awardedAt ?? null })),
    series,
    heat,
    activeLast14: last14,
    returns,
    improvements,
    topicStats: topicStats.filter((t) => t.total > 0),
    recurring,
    hasDemo: demoCount > 0,
    quiet: profile.quietMode,
    showGrowth: profile.showGrowthVisual,
  };
}
