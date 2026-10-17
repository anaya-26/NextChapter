import "server-only";
import type { AgeBand, Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

export const MINOR_AGE_BANDS: AgeBand[] = ["UNDER_13", "TEEN_13_15", "TEEN_16_17"];

export function isMinor(ageBand: AgeBand | null | undefined): boolean {
  return !!ageBand && MINOR_AGE_BANDS.includes(ageBand);
}

/** Creates the private profile and conservative privacy defaults for a new account. */
export async function bootstrapStudent(userId: string, name: string) {
  await prisma.$transaction([
    prisma.studentProfile.upsert({
      where: { userId },
      create: { userId, displayName: name?.split(" ")[0] || null },
      update: {},
    }),
    prisma.privacySettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
  ]);
}

export async function getProfile(userId: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (profile) return profile;
  await bootstrapStudent(userId, "");
  return prisma.studentProfile.findUniqueOrThrow({ where: { userId } });
}

export async function getPrivacy(userId: string) {
  const privacy = await prisma.privacySettings.findUnique({ where: { userId } });
  if (privacy) return privacy;
  return prisma.privacySettings.create({ data: { userId } });
}

/**
 * Age-aware defaults. India's DPDP Act treats under-18s as children: no behavioural
 * monitoring by default and guardian consent is required before optional processing.
 */
export async function applyAgeBand(userId: string, ageBand: AgeBand) {
  const minor = isMinor(ageBand);
  const profileUpdate: Prisma.StudentProfileUpdateInput = { ageBand };
  if (minor) {
    const current = await getProfile(userId);
    if (current.guardianConsent !== "RECORDED") profileUpdate.guardianConsent = "PENDING";
  } else {
    profileUpdate.guardianConsent = "NOT_REQUIRED";
  }
  await prisma.studentProfile.update({ where: { userId }, data: profileUpdate });
  if (minor) {
    await prisma.privacySettings.update({
      where: { userId },
      data: { aiInferPatterns: false, communityVisible: false },
    });
  }
}

export type ProfilePatch = Prisma.StudentProfileUpdateInput;

export async function updateProfile(userId: string, patch: ProfilePatch) {
  await getProfile(userId);
  return prisma.studentProfile.update({ where: { userId }, data: patch });
}

export async function updatePrivacy(userId: string, patch: Prisma.PrivacySettingsUpdateInput) {
  await getPrivacy(userId);
  const profile = await getProfile(userId);
  // Children's behavioural-pattern inference stays off until guardian consent is recorded.
  if (isMinor(profile.ageBand) && profile.guardianConsent !== "RECORDED") {
    patch = { ...patch, aiInferPatterns: false, communityVisible: false };
  }
  const updated = await prisma.privacySettings.update({ where: { userId }, data: patch });
  if (updated.aiUseJournal === false) {
    // Revoking journal access also removes everything the AI learned from the journal.
    await prisma.memoryItem.deleteMany({ where: { userId, journalEntryId: { not: null } } });
  }
  if (!updated.aiInferPatterns) {
    await prisma.memoryItem.deleteMany({ where: { userId, source: "INFERRED" } });
  }
  return updated;
}

/** Records a guardian's consent as attested by the student (verifiable consent is an outstanding integration). */
export async function recordGuardianConsent(userId: string, at: Date) {
  return prisma.studentProfile.update({
    where: { userId },
    data: { guardianConsent: "RECORDED", guardianConsentAt: at },
  });
}

export async function advanceOnboarding(userId: string, step: number, complete = false, at = new Date()) {
  const profile = await getProfile(userId);
  return prisma.studentProfile.update({
    where: { userId },
    data: {
      onboardingStep: Math.max(profile.onboardingStep, step),
      ...(complete && !profile.onboardingCompletedAt ? { onboardingCompletedAt: at } : {}),
    },
  });
}

/** How complete the progressive profile is (0–100) and what is still missing. */
export function profileCompleteness(p: {
  educationStage: unknown;
  course: string | null;
  examTargets: string[];
  interests: string[];
  careerClarity: unknown;
  weeklyStudyHoursTarget: number | null;
  ageBand: string;
}) {
  const checks: [boolean, string][] = [
    [!!p.educationStage, "education stage"],
    [!!p.course, "course or class"],
    [p.examTargets.length > 0, "exam targets"],
    [p.interests.length > 0, "interests"],
    [!!p.careerClarity, "career direction"],
    [p.weeklyStudyHoursTarget != null, "weekly study time"],
    [p.ageBand !== "UNDISCLOSED", "age group"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, l]) => l) };
}
