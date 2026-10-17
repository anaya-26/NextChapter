"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import {
  companionSchema,
  educationSchema,
  examsSchema,
  goalsInterestsSchema,
  profileBasicsSchema,
  timeSchema,
} from "@/lib/validation";
import { LOCALE_COOKIE } from "@/i18n/locales";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { advanceOnboarding, applyAgeBand, updatePrivacy, updateProfile } from "@/server/services/profile";
import { ensureSubjects } from "@/server/services/subjects";
import { createGoal, upsertCareerInterest } from "@/server/services/goals";
import { ONBOARDING_STEPS } from "./steps";

async function setLocaleCookie(locale: string) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

function parse<T extends z.ZodType>(schema: T, form: FormData, arrays: string[] = []) {
  return schema.safeParse(formToObject(form, arrays));
}

export async function saveOnboardingStep(step: number, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const at = await now(user.id);

  switch (step) {
    case 1: {
      const r = parse(profileBasicsSchema, form);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { displayName: r.data.displayName, preferredLanguage: r.data.preferredLanguage });
      await applyAgeBand(user.id, r.data.ageBand);
      await setLocaleCookie(r.data.preferredLanguage);
      break;
    }
    case 2: {
      const r = parse(educationSchema, form, ["qualificationsDone", "qualificationsPursuing"]);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { ...r.data, educationStage: r.data.educationStage ?? null });
      break;
    }
    case 3: {
      const r = parse(examsSchema, form, ["examTargets", "subjects"]);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { examTargets: r.data.examTargets });
      await ensureSubjects(user.id, r.data.subjects);
      break;
    }
    case 4: {
      const r = parse(timeSchema, form, ["preferredStudyTimes"]);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, r.data);
      break;
    }
    case 5: {
      const r = parse(goalsInterestsSchema, form, ["selectedDomains", "interests", "skills"]);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      const { firstGoal, selectedDomains, ...rest } = r.data;
      await updateProfile(user.id, { ...rest, careerClarity: rest.careerClarity ?? null });
      for (const domain of selectedDomains) {
        await upsertCareerInterest(user.id, {
          domain,
          roles: [],
          companies: [],
          cities: [],
          workModes: [],
          status: r.data.careerClarity === "CLEAR" ? "SELECTED" : "EXPLORING",
          notes: null,
        });
      }
      if (firstGoal) {
        await createGoal(user.id, {
          title: firstGoal,
          description: null,
          whyItMatters: null,
          horizon: "SHORT",
          category: "ACADEMIC",
          targetDate: null,
          isCurrentPriority: true,
        });
      }
      break;
    }
    case 6: {
      const r = parse(companionSchema, form);
      if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
      await updateProfile(user.id, { ...r.data, companionTone: r.data.companionTone ?? 30 });
      await updatePrivacy(user.id, {
        aiUseJournal: form.get("aiUseJournal") === "on",
        aiInferPatterns: form.get("aiInferPatterns") === "on",
      });
      await advanceOnboarding(user.id, 6, true, at);
      redirect("/today?welcome=1");
    }
    default:
      return fail("Unknown step");
  }

  await advanceOnboarding(user.id, step, false, at);
  redirect(`/onboarding?step=${Math.min(step + 1, ONBOARDING_STEPS)}`);
}

export async function skipOnboarding() {
  const user = await requireUser();
  await advanceOnboarding(user.id, ONBOARDING_STEPS, true, await now(user.id));
  redirect("/today");
}
