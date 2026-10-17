import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { getProfile, getPrivacy } from "@/server/services/profile";
import { listSubjects } from "@/server/services/subjects";
import { listCommitments } from "@/server/services/commitments";
import { OnboardingWizard } from "./wizard";
import { toProfileInit } from "./profile-init";
import { ONBOARDING_STEPS } from "./steps";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser();
  const { step: rawStep } = await props.searchParams;
  const [profile, privacy, subjects, commitments] = await Promise.all([
    getProfile(user.id),
    getPrivacy(user.id),
    listSubjects(user.id),
    listCommitments(user.id),
  ]);
  const requested = Number(rawStep);
  const step = Number.isInteger(requested) && requested >= 1 && requested <= ONBOARDING_STEPS ? requested : Math.min(profile.onboardingStep + 1, ONBOARDING_STEPS);

  return (
    <OnboardingWizard
      step={step}
      profile={toProfileInit(profile, user.name)}
      privacy={{ aiUseJournal: privacy.aiUseJournal, aiInferPatterns: privacy.aiInferPatterns }}
      subjects={subjects.map((s) => s.name)}
      commitments={commitments.map((c) => ({ id: c.id, title: c.title, kind: c.kind, daysOfWeek: c.daysOfWeek, startTime: c.startTime, endTime: c.endTime }))}
    />
  );
}
