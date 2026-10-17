"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import {
  commitmentSchema,
  companionSchema,
  educationSchema,
  goalsInterestsSchema,
  memorySchema,
  profileBasicsSchema,
  timeSchema,
} from "@/lib/validation";
import { LOCALE_COOKIE } from "@/i18n/locales";
import { requireUser } from "@/server/session";
import { auth } from "@/server/auth";
import { clearTestClock, now, setTestClock } from "@/server/clock";
import { applyAgeBand, getProfile, recordGuardianConsent, updatePrivacy, updateProfile } from "@/server/services/profile";
import { zonedToUtc } from "@/lib/time";
import { addMemory, confirmMemory, correctMemory, deleteAllMemories, deleteMemory } from "@/server/services/memory";
import { createCommitment, deleteCommitment, updateCommitment } from "@/server/services/commitments";
import { deleteUserFiles } from "@/server/services/account";

const ok = (message: string): ActionResult => {
  refresh();
  return { ok: true, message };
};

/* ── Profile ────────────────────────────────────────────────────────── */

export async function saveProfileSection(section: "basics" | "education" | "exams" | "time" | "goals" | "companion", _prev: ActionResult, form: FormData) {
  const user = await requireUser();
  switch (section) {
    case "basics": {
      const r = profileBasicsSchema.safeParse(formToObject(form));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { displayName: r.data.displayName, preferredLanguage: r.data.preferredLanguage });
      await applyAgeBand(user.id, r.data.ageBand);
      (await cookies()).set(LOCALE_COOKIE, r.data.preferredLanguage, { path: "/", maxAge: 31536000, sameSite: "lax" });
      return ok("Saved");
    }
    case "education": {
      const r = educationSchema.safeParse(formToObject(form, ["qualificationsDone", "qualificationsPursuing"]));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { ...r.data, educationStage: r.data.educationStage ?? null });
      return ok("Education saved");
    }
    case "exams": {
      const r = z.object({ examTargets: z.array(z.string().max(80)).max(30) }).safeParse(formToObject(form, ["examTargets"]));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { examTargets: r.data.examTargets });
      return ok("Exam targets saved");
    }
    case "time": {
      const r = timeSchema.safeParse(formToObject(form, ["preferredStudyTimes"]));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, r.data);
      return ok("Study time saved");
    }
    case "goals": {
      const r = goalsInterestsSchema.safeParse(formToObject(form, ["selectedDomains", "interests", "skills"]));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      const { firstGoal: _ignored, selectedDomains: _domains, ...rest } = r.data;
      await updateProfile(user.id, { ...rest, careerClarity: rest.careerClarity ?? null });
      return ok("Interests saved");
    }
    case "companion": {
      const r = companionSchema.safeParse(formToObject(form));
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { ...r.data, companionTone: r.data.companionTone ?? 30 });
      return ok("Companion settings saved");
    }
  }
}

/* ── Privacy & consent ──────────────────────────────────────────────── */

export async function savePrivacy(_prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const flag = (k: string) => form.get(k) === "on";
  await updatePrivacy(user.id, {
    aiUseProfile: flag("aiUseProfile"),
    aiUseProgress: flag("aiUseProgress"),
    aiUseGoals: flag("aiUseGoals"),
    aiUseCalendar: flag("aiUseCalendar"),
    aiUseJournal: flag("aiUseJournal"),
    aiInferPatterns: flag("aiInferPatterns"),
    aiMemoryEnabled: flag("aiMemoryEnabled"),
    communityVisible: flag("communityVisible"),
  });
  return ok("Privacy settings saved");
}

export async function recordConsent(_prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const r = z
    .object({ guardianName: z.string().trim().min(2, "Enter the guardian's name"), confirm: z.literal("on", { message: "Please confirm" }) })
    .safeParse(formToObject(form));
  if (!r.success) return fail("Please complete the consent form.", fieldErrorsFrom(r.error));
  await recordGuardianConsent(user.id, await now(user.id));
  return ok(`Consent from ${r.data.guardianName} recorded`);
}

/* ── Memory ─────────────────────────────────────────────────────────── */

export async function addMemoryAction(_prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const r = memorySchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  await addMemory(user.id, { ...r.data, source: "STUDENT", certainty: "STATED" });
  return ok("Kadam will remember this");
}

export async function memoryAction(op: "confirm" | "delete", id: string) {
  const user = await requireUser();
  if (op === "confirm") await confirmMemory(user.id, id);
  else await deleteMemory(user.id, id);
  refresh();
}

export async function correctMemoryAction(id: string, _prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const content = String(form.get("content") ?? "").trim();
  if (content.length < 3) return fail("Write the corrected statement", { content: "Too short" });
  await correctMemory(user.id, id, content.slice(0, 400));
  return ok("Corrected — future suggestions will use this");
}

export async function forgetEverything() {
  const user = await requireUser();
  await deleteAllMemories(user.id);
  refresh();
}

/* ── Commitments ────────────────────────────────────────────────────── */

export async function saveCommitment(id: string | null, _prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const r = commitmentSchema.safeParse(formToObject(form, ["daysOfWeek"]));
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  if (id) await updateCommitment(user.id, id, r.data);
  else await createCommitment(user.id, r.data);
  return ok(id ? "Commitment updated" : "Commitment added");
}

export async function removeCommitment(id: string) {
  const user = await requireUser();
  await deleteCommitment(user.id, id);
  refresh();
}

/* ── Developer tools (test clock) ───────────────────────────────────── */

export async function setTestClockAction(_prev: ActionResult, form: FormData) {
  const user = await requireUser();
  const raw = String(form.get("simulatedNow") ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
  if (!match) return fail("Choose a date and time");
  // datetime-local has no zone: interpret it in the student's own timezone.
  const profile = await getProfile(user.id);
  const date = zonedToUtc(match[1], match[2], profile.timezone);
  try {
    await setTestClock(user.id, date);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not set the test clock");
  }
  return ok("Test clock set");
}

export async function clearTestClockAction() {
  const user = await requireUser();
  await clearTestClock(user.id);
  refresh();
}

/* ── Account ────────────────────────────────────────────────────────── */

export async function deleteAccount(_prev: ActionResult, form: FormData) {
  const user = await requireUser();
  if (form.get("confirmText") !== "DELETE") return fail("Type DELETE to confirm", { confirmText: "Type DELETE" });
  const password = String(form.get("password") ?? "");
  try {
    await deleteUserFiles(user.id);
    await auth().api.deleteUser({ body: { password }, headers: await headers() });
  } catch {
    return fail("Could not delete the account — check your password and try again.");
  }
  redirect("/?deleted=1");
}
