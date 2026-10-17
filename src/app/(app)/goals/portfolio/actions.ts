"use server";

import { refresh } from "next/cache";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { achievementSchema, educationRecordSchema } from "@/lib/validation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { uploadLimitBytes } from "@/server/storage";
import { approveAchievement, createAchievement, deleteAchievement, deleteEducation, saveEducation, updateAchievement, withdrawAchievement, type EvidenceUpload } from "@/server/services/portfolio";
import { getProfile } from "@/server/services/profile";

async function evidenceFiles(form: FormData): Promise<EvidenceUpload[]> {
  const files = form.getAll("evidence").filter((f): f is File => f instanceof File && f.size > 0);
  const limit = uploadLimitBytes("document");
  const big = files.find((f) => f.size > limit);
  if (big) throw new Error(`“${big.name}” is larger than ${Math.round(limit / 1048576)} MB`);
  return Promise.all(files.map(async (f) => ({ fileName: f.name || "evidence", mime: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) })));
}

export async function saveAchievementAction(id: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const r = achievementSchema.safeParse(formToObject(form, ["skills", "subjects", "evidenceLinks"]));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  try {
    const files = await evidenceFiles(form);
    const saved = id
      ? await updateAchievement(user.id, id, r.data, files, form.getAll("removeFile").map(String))
      : await createAchievement(user.id, r.data, files, await now(user.id));
    refresh();
    return { ok: true, message: id ? "Saved — approve it again to show it in CVs" : "Saved as a draft — approve it when it’s accurate", data: { id: saved.id } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t save");
  }
}

export async function approveAchievementAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await approveAchievement(user.id, id, await now(user.id));
    const profile = await getProfile(user.id);
    refresh();
    if (!r.hasEvidence) return { ok: true, message: "Approved. Add a link or file as evidence to make it stronger." };
    return { ok: true, message: r.xp?.awarded && !profile.quietMode ? `Approved · +${r.xp.points} XP` : "Approved — it can now appear in your CVs" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t approve");
  }
}

export async function withdrawAchievementAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await withdrawAchievement(user.id, id);
  refresh();
  return { ok: true, message: "Taken out of CVs until you approve it again" };
}

export async function deleteAchievementAction(id: string) {
  const user = await requireUser();
  await deleteAchievement(user.id, id);
  refresh();
}

export async function saveEducationAction(id: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = educationRecordSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  try {
    await saveEducation(user.id, r.data, id ?? undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t save");
  }
  refresh();
  return { ok: true, message: "Education saved" };
}

export async function deleteEducationAction(id: string) {
  const user = await requireUser();
  await deleteEducation(user.id, id);
  refresh();
}
