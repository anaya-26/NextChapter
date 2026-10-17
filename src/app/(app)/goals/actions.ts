"use server";

import { refresh } from "next/cache";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { careerInterestSchema, goalSchema, milestoneSchema } from "@/lib/validation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import {
  addMilestone,
  createGoal,
  deleteCareerInterest,
  deleteGoal,
  deleteMilestone,
  setGoalStatus,
  setPriorityGoal,
  toggleMilestone,
  updateGoal,
  upsertCareerInterest,
  syncSelectedDomains,
} from "@/server/services/goals";
import { awardXp } from "@/server/services/xp";

export async function saveGoal(id: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = goalSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  if (id) await updateGoal(user.id, id, r.data);
  else await createGoal(user.id, r.data);
  refresh();
  return { ok: true, message: id ? "Goal updated" : "Goal added" };
}

export async function goalStatusAction(id: string, status: "ACTIVE" | "ACHIEVED" | "PAUSED" | "DROPPED") {
  const user = await requireUser();
  await setGoalStatus(user.id, id, status, await now(user.id));
  refresh();
}

export async function makePriority(id: string) {
  const user = await requireUser();
  await setPriorityGoal(user.id, id);
  refresh();
}

export async function removeGoal(id: string) {
  const user = await requireUser();
  await deleteGoal(user.id, id);
  refresh();
}

export async function addMilestoneAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = milestoneSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the milestone.", fieldErrorsFrom(r.error));
  const m = await addMilestone(user.id, r.data.goalId, r.data.title, r.data.dueAt);
  if (!m) return fail("Goal not found");
  refresh();
  return { ok: true, message: "Milestone added" };
}

export async function toggleMilestoneAction(id: string) {
  const user = await requireUser();
  const at = await now(user.id);
  const m = await toggleMilestone(user.id, id, at);
  if (m?.completedAt) {
    await awardXp(user.id, { action: "MILESTONE", dedupeKey: `milestone:${id}`, reason: `Milestone reached: ${m.title}`, sourceType: "Milestone", sourceId: id, at });
  }
  refresh();
}

export async function removeMilestone(id: string) {
  const user = await requireUser();
  await deleteMilestone(user.id, id);
  refresh();
}

export async function saveCareerInterest(id: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = careerInterestSchema.safeParse(formToObject(form, ["roles", "companies", "cities", "workModes"]));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  await upsertCareerInterest(user.id, r.data, id ?? undefined);
  await syncSelectedDomains(user.id);
  refresh();
  return { ok: true, message: id ? "Updated" : "Career interest saved" };
}

export async function removeCareerInterest(id: string) {
  const user = await requireUser();
  await deleteCareerInterest(user.id, id);
  refresh();
}
