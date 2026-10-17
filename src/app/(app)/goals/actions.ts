"use server";

import { refresh } from "next/cache";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { careerInterestSchema, goalSchema, milestoneSchema } from "@/lib/validation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { describeAiError } from "@/server/ai";
import { completeExploration, createDomainGoal, dropExploration, generateCareerReview, reviewFeedback, startExploration } from "@/server/services/career";
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

/* ── Career discovery ─────────────────────────────────────────────── */

export async function generateCareerReviewAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await generateCareerReview(user.id, await now(user.id));
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
  refresh();
  return { ok: true, message: "Your review is ready" };
}

export async function startExplorationAction(input: { reviewId?: string; index?: number; domain?: string }): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await startExploration(user.id, input);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't start");
  }
  refresh();
  return { ok: true, message: "Exploration added — see “Explorations” below" };
}

export async function completeExplorationAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const reflection = String(form.get("reflection") ?? "").trim();
  const interest = String(form.get("interest") ?? "");
  if (reflection.length < 10) return fail("Write a sentence or two about what you noticed", { reflection: "Too short" });
  if (!["MORE", "SAME", "LESS"].includes(interest)) return fail("How do you feel about this area now?", { interest: "Pick one" });
  await completeExploration(user.id, id, { reflection, interest: interest as "MORE" }, await now(user.id));
  refresh();
  return { ok: true, message: "Exploration complete — that’s real evidence for your next review" };
}

export async function dropExplorationAction(id: string) {
  const user = await requireUser();
  await dropExploration(user.id, id);
  refresh();
}

export async function reviewFeedbackAction(reviewId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await reviewFeedback(user.id, reviewId, String(form.get("feedback") ?? ""));
  refresh();
  return { ok: true, message: "Thanks — noted for next time" };
}

export async function createDomainGoalAction(domain: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await createDomainGoal(user.id, domain);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't create the goal");
  }
  refresh();
  return { ok: true, message: "Goal created with milestones — see Goals" };
}
