import "server-only";
import { Prisma, type XpAction } from "@/generated/prisma/client";
import { XP_RULES, RETURN_GAP_DAYS, cappedPoints, levelForXp } from "@/lib/xp-rules";
import { addDaysToKey, dateOnly, daysBetweenKeys, localDateKey } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";

export type AwardInput = {
  action: XpAction;
  /** Unique per meaningful action, e.g. `attempt:<questionId>` — repeats are ignored. */
  dedupeKey: string;
  reason: string;
  /** Overrides the rule's default points (e.g. session length based). */
  points?: number;
  sourceType?: string;
  sourceId?: string;
  at: Date;
  isDemo?: boolean;
};

export type AwardResult = { awarded: boolean; points: number; reason: string; returnBonus?: number };

/**
 * Awards XP once per dedupe key, respecting daily caps, and celebrates returning after a
 * break. Safe to call repeatedly — duplicates are rejected by a unique constraint.
 */
export async function awardXp(userId: string, input: AwardInput): Promise<AwardResult> {
  const rule = XP_RULES[input.action];
  const base = input.points ?? rule.points;
  if (base <= 0) return { awarded: false, points: 0, reason: "No XP for this action" };

  const profile = await getProfile(userId);
  const dayKey = localDateKey(input.at, profile.timezone);
  const day = dateOnly(dayKey);

  const existing = await prisma.xpEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: input.dedupeKey } } });
  if (existing) return { awarded: false, points: 0, reason: "Already counted" };

  let earnedToday = 0;
  if (rule.dailyCap !== undefined) {
    const agg = await prisma.xpEvent.aggregate({ where: { userId, action: input.action, occurredOn: day }, _sum: { points: true } });
    earnedToday = agg._sum.points ?? 0;
  }
  const points = cappedPoints(base, earnedToday, rule.dailyCap);
  if (points <= 0) return { awarded: false, points: 0, reason: `Daily limit for ${rule.label.toLowerCase()} reached` };

  const returnBonus = input.action === "RETURN_AFTER_BREAK" ? 0 : await maybeAwardReturn(userId, dayKey, input.at, input.isDemo);

  try {
    await prisma.xpEvent.create({
      data: {
        userId,
        action: input.action,
        points,
        dedupeKey: input.dedupeKey,
        reason: input.reason,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        occurredOn: day,
        isDemo: input.isDemo ?? false,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { awarded: false, points: 0, reason: "Already counted" };
    }
    throw error;
  }
  await evaluateBadges(userId, input.at);
  return { awarded: true, points, reason: input.reason, returnBonus };
}

/** If the last active day was 3+ days ago, celebrate the return (once per return day). */
async function maybeAwardReturn(userId: string, todayKey: string, at: Date, isDemo?: boolean): Promise<number> {
  const last = await prisma.xpEvent.findFirst({
    where: { userId, occurredOn: { lt: dateOnly(todayKey) } },
    orderBy: { occurredOn: "desc" },
    select: { occurredOn: true },
  });
  if (!last) return 0;
  const gap = daysBetweenKeys(last.occurredOn.toISOString().slice(0, 10), todayKey);
  if (gap < RETURN_GAP_DAYS) return 0;
  const todayAlready = await prisma.xpEvent.count({ where: { userId, occurredOn: dateOnly(todayKey) } });
  if (todayAlready > 0) return 0;
  try {
    await prisma.xpEvent.create({
      data: {
        userId,
        action: "RETURN_AFTER_BREAK",
        points: XP_RULES.RETURN_AFTER_BREAK.points,
        dedupeKey: `return:${todayKey}`,
        reason: `Welcome back after ${gap} days`,
        occurredOn: dateOnly(todayKey),
        isDemo: isDemo ?? false,
      },
    });
    await prisma.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey: `return:${todayKey}` } },
      create: {
        userId,
        kind: "SYSTEM",
        title: "Welcome back!",
        body: `It's been ${gap} days — picking things up again is what counts. +${XP_RULES.RETURN_AFTER_BREAK.points} XP`,
        dueAt: at,
        dedupeKey: `return:${todayKey}`,
      },
      update: {},
    });
    return XP_RULES.RETURN_AFTER_BREAK.points;
  } catch {
    return 0;
  }
}

async function grant(userId: string, code: string, at: Date) {
  await prisma.userBadge.upsert({
    where: { userId_badgeCode: { userId, badgeCode: code } },
    create: { userId, badgeCode: code, awardedAt: at },
    update: {},
  });
}

export async function evaluateBadges(userId: string, at: Date) {
  const counts = await prisma.xpEvent.groupBy({ by: ["action"], where: { userId }, _count: true });
  const n = (a: XpAction) => counts.find((c) => c.action === a)?._count ?? 0;
  const total = counts.reduce((s, c) => s + c._count, 0);
  if (total > 0) await grant(userId, "first-step", at);
  if (n("SYLLABUS_CONFIRMED") >= 1) await grant(userId, "syllabus-mapped", at);
  if (n("UNDERSTANDING_CHECK") >= 5) await grant(userId, "understanding-5", at);
  if (n("REVISION_COMPLETE") >= 5) await grant(userId, "revision-rhythm", at);
  if (n("MISTAKE_REVIEW") >= 5) await grant(userId, "mistake-hunter", at);
  if (n("PEER_HELP") >= 1) await grant(userId, "helpful-peer", at);
  if (n("RETURN_AFTER_BREAK") >= 1) await grant(userId, "comeback", at);
  if (n("REFLECTION") >= 5) await grant(userId, "reflective", at);
  if (n("EXPERIMENT") >= 1) await grant(userId, "experimenter", at);
  if (n("ACHIEVEMENT_ADDED") >= 3) await grant(userId, "portfolio-builder", at);
  const profile = await getProfile(userId);
  const today = localDateKey(at, profile.timezone);
  const activeDays = await prisma.xpEvent.findMany({
    where: { userId, occurredOn: { gte: dateOnly(addDaysToKey(today, -13)) } },
    distinct: ["occurredOn"],
    select: { occurredOn: true },
  });
  if (activeDays.length >= 7) await grant(userId, "steady-week", at);
}

export async function xpSummary(userId: string) {
  const agg = await prisma.xpEvent.aggregate({ where: { userId }, _sum: { points: true } });
  const total = agg._sum.points ?? 0;
  return { total, ...levelForXp(total) };
}
