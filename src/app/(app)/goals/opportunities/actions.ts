"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { RequirementState } from "@/generated/prisma/client";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { applicationUpdateSchema, interviewAnswerSchema, manualOpportunitySchema, opportunityEditSchema } from "@/lib/validation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { describeAiError } from "@/server/ai";
import { addManualOpportunity, deleteManualOpportunity, saveOpportunity, unsaveOpportunity, updateManualOpportunity } from "@/server/services/opportunities";
import { analyseGaps, answerInterview, deletePractice, planForGap, setRequirementState, updateApplication } from "@/server/services/applications";

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function addOpportunityLinkAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = manualOpportunitySchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the link details.", fieldErrorsFrom(r.error));
  let id: string;
  try {
    const { opportunity } = await addManualOpportunity(user.id, r.data, await now(user.id));
    id = opportunity.id;
  } catch (e) {
    return fail(message(e, "Couldn’t save the link"));
  }
  redirect(`/goals/opportunities/${id}?added=1`);
}

export async function editOpportunityAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = opportunityEditSchema.safeParse(formToObject(form, ["requirements"]));
  if (!r.success) return fail("Please check the details.", fieldErrorsFrom(r.error));
  try {
    await updateManualOpportunity(user.id, id, r.data);
  } catch (e) {
    return fail(message(e, "Couldn’t save"));
  }
  refresh();
  return { ok: true, message: "Details updated" };
}

export async function deleteOpportunityAction(id: string) {
  const user = await requireUser();
  await deleteManualOpportunity(user.id, id);
  redirect("/goals/opportunities?view=saved");
}

export async function saveOpportunityAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await saveOpportunity(user.id, id, await now(user.id));
  } catch (e) {
    return fail(message(e, "Couldn’t save"));
  }
  refresh();
  return { ok: true, message: "Saved — it’s in your applications" };
}

export async function unsaveOpportunityAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await unsaveOpportunity(user.id, id);
  refresh();
  return { ok: true, message: "Removed from your applications" };
}

export async function updateApplicationAction(applicationId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = applicationUpdateSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the tracker.", fieldErrorsFrom(r.error));
  if (r.data.nextStepDate && !r.data.nextStep) return fail("Say what the next step is.", { nextStep: "Add the next step" });
  try {
    await updateApplication(user.id, applicationId, r.data, await now(user.id));
  } catch (e) {
    return fail(message(e, "Couldn’t update"));
  }
  refresh();
  return { ok: true, message: r.data.nextStep && r.data.nextStepDate ? "Updated — next step added to your calendar" : "Tracker updated" };
}

export async function analyseGapsAction(applicationId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await analyseGaps(user.id, applicationId);
    refresh();
    const gaps = r.rows.filter((x) => x.state === "GAP").length;
    return { ok: true, message: gaps ? `${gaps} gap${gaps === 1 ? "" : "s"} found — each can become a plan` : "No gaps found in what you’ve shown" };
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
}

export async function setRequirementAction(checkId: string, state: RequirementState): Promise<ActionResult> {
  const user = await requireUser();
  if (!["MET", "GAP", "UNKNOWN"].includes(state)) return fail("Unknown state");
  try {
    await setRequirementState(user.id, checkId, state);
  } catch (e) {
    return fail(message(e, "Couldn’t update"));
  }
  refresh();
  return { ok: true };
}

export async function planGapAction(checkId: string): Promise<ActionResult<{ href: string }>> {
  const user = await requireUser();
  try {
    const r = await planForGap(user.id, checkId, await now(user.id));
    refresh();
    return { ok: true, message: r.created ? "Goal created with milestones, and a first session added to your calendar" : "This gap already has a goal", data: { href: r.dateKey ? `/calendar?date=${r.dateKey}` : "/goals" } };
  } catch (e) {
    return fail(message(e, "Couldn’t make a plan"));
  }
}

export async function answerInterviewAction(_prev: ActionResult, form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const r = interviewAnswerSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check your answer.", fieldErrorsFrom(r.error));
  try {
    const { practice } = await answerInterview(user.id, r.data, await now(user.id));
    refresh();
    return { ok: true, message: "Feedback ready", data: { id: practice.id } };
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
}

export async function deletePracticeAction(id: string) {
  const user = await requireUser();
  await deletePractice(user.id, id);
  refresh();
}
