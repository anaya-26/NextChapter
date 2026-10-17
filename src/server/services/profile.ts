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
