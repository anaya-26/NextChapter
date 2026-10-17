"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { cvCreateSchema, cvDetailsSchema } from "@/lib/validation";
import { requireUser } from "@/server/session";
import { describeAiError } from "@/server/ai";
import { SECTION_KEYS, type SectionKey } from "@/lib/cv-sections";
import { createCv, deleteCv, moveSection, resetOverride, resolveSuggestion, tailorCv, updateCv } from "@/server/services/cv";

export async function createCvAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = cvCreateSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the details.", fieldErrorsFrom(r.error));
  let id: string;
  try {
    const cv = await createCv(user.id, r.data);
    if (r.data.targetOpportunityId) await tailorCv(user.id, cv.id, r.data.targetOpportunityId);
    id = cv.id;
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
  redirect(`/goals/cv/${id}`);
}

export async function saveCvDetailsAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = cvDetailsSchema.safeParse(formToObject(form, ["achievementIds", "educationIds", "skills"]));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  try {
    await updateCv(user.id, id, r.data);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t save");
  }
  refresh();
  return { ok: true, message: "CV saved" };
}

export async function moveSectionAction(id: string, key: SectionKey, dir: -1 | 1) {
  const user = await requireUser();
  if (!SECTION_KEYS.includes(key) || (dir !== -1 && dir !== 1)) return;
  await moveSection(user.id, id, key, dir);
  refresh();
}

export async function tailorCvAction(id: string, opportunityId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await tailorCv(user.id, id, opportunityId);
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
  refresh();
  return { ok: true, message: "Tailored — review the suggestions below" };
}

export async function resolveSuggestionAction(id: string, achievementId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await resolveSuggestion(user.id, id, achievementId, accept);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t update");
  }
  refresh();
  return { ok: true, message: accept ? "Line updated" : "Suggestion dismissed" };
}

export async function resetOverrideAction(id: string, achievementId: string) {
  const user = await requireUser();
  await resetOverride(user.id, id, achievementId);
  refresh();
}

export async function deleteCvAction(id: string) {
  const user = await requireUser();
  await deleteCv(user.id, id);
  redirect("/goals/cv");
}
