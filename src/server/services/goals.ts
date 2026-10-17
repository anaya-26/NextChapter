import "server-only";
import type { GoalCategory, GoalHorizon, GoalOrigin, InterestStatus } from "@/generated/prisma/client";
import { dateOnly } from "@/lib/time";
import { prisma } from "../db";

export type GoalInput = {
  title: string;
  description: string | null;
  whyItMatters: string | null;
  horizon: GoalHorizon;
  category: GoalCategory;
  targetDate: string | null;
  isCurrentPriority: boolean;
};

export async function listGoals(userId: string) {
  return prisma.goal.findMany({
    where: { userId },
    include: { milestones: { orderBy: [{ order: "asc" }, { dueAt: "asc" }] } },
    orderBy: [{ isCurrentPriority: "desc" }, { status: "asc" }, { targetDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function getGoal(userId: string, id: string) {
  return prisma.goal.findFirst({ where: { id, userId }, include: { milestones: { orderBy: { order: "asc" } } } });
}

/** Only one goal can be the current priority. */
export async function createGoal(userId: string, input: GoalInput, origin: GoalOrigin = "STUDENT", extra: { requirementId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    if (input.isCurrentPriority) {
      await tx.goal.updateMany({ where: { userId, isCurrentPriority: true }, data: { isCurrentPriority: false } });
    }
    return tx.goal.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        whyItMatters: input.whyItMatters,
        horizon: input.horizon,
        category: input.category,
        targetDate: input.targetDate ? dateOnly(input.targetDate) : null,
        isCurrentPriority: input.isCurrentPriority,
        origin,
        requirementId: extra.requirementId,
      },
    });
  });
}

export async function updateGoal(userId: string, id: string, input: GoalInput) {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id, userId } });
    if (!goal) return null;
    if (input.isCurrentPriority) {
      await tx.goal.updateMany({ where: { userId, isCurrentPriority: true, NOT: { id } }, data: { isCurrentPriority: false } });
    }
    return tx.goal.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        whyItMatters: input.whyItMatters,
        horizon: input.horizon,
        category: input.category,
        targetDate: input.targetDate ? dateOnly(input.targetDate) : null,
        isCurrentPriority: input.isCurrentPriority,
      },
    });
  });
}

export async function setPriorityGoal(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id, userId } });
    if (!goal) return false;
    await tx.goal.updateMany({ where: { userId, isCurrentPriority: true }, data: { isCurrentPriority: false } });
    await tx.goal.update({ where: { id }, data: { isCurrentPriority: true, status: "ACTIVE" } });
    return true;
  });
}

export async function setGoalStatus(userId: string, id: string, status: "ACTIVE" | "ACHIEVED" | "PAUSED" | "DROPPED", at: Date) {
  const res = await prisma.goal.updateMany({
    where: { id, userId },
    data: {
      status,
      achievedAt: status === "ACHIEVED" ? at : null,
      ...(status === "ACTIVE" ? {} : { isCurrentPriority: false }),
    },
  });
  return res.count === 1;
}

export async function deleteGoal(userId: string, id: string) {
  const res = await prisma.goal.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

export async function addMilestone(userId: string, goalId: string, title: string, dueAt: string | null) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return null;
  const count = await prisma.milestone.count({ where: { goalId } });
  return prisma.milestone.create({
    data: { goalId, userId, title, dueAt: dueAt ? dateOnly(dueAt) : null, order: count },
  });
}

export async function toggleMilestone(userId: string, id: string, at: Date) {
  const m = await prisma.milestone.findFirst({ where: { id, userId } });
  if (!m) return null;
  return prisma.milestone.update({ where: { id }, data: { completedAt: m.completedAt ? null : at } });
}

export async function deleteMilestone(userId: string, id: string) {
  const res = await prisma.milestone.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/* ── Career interests ───────────────────────────────────────────────── */

export type CareerInterestInput = {
  domain: string;
  roles: string[];
  companies: string[];
  cities: string[];
  workModes: string[];
  status: InterestStatus;
  notes: string | null;
};

export async function listCareerInterests(userId: string) {
  return prisma.careerInterest.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
}

export async function upsertCareerInterest(userId: string, input: CareerInterestInput, id?: string) {
  if (id) {
    const res = await prisma.careerInterest.updateMany({ where: { id, userId }, data: input });
    return res.count === 1;
  }
  await prisma.careerInterest.create({ data: { userId, ...input } });
  // Keep the profile's selected domains in step with SELECTED interests.
  await syncSelectedDomains(userId);
  return true;
}

export async function deleteCareerInterest(userId: string, id: string) {
  const res = await prisma.careerInterest.deleteMany({ where: { id, userId } });
  await syncSelectedDomains(userId);
  return res.count === 1;
}

export async function syncSelectedDomains(userId: string) {
  const selected = await prisma.careerInterest.findMany({ where: { userId, status: "SELECTED" }, select: { domain: true } });
  await prisma.studentProfile.update({
    where: { userId },
    data: { selectedDomains: [...new Set(selected.map((s) => s.domain))] },
  });
}
