import "server-only";
import type { CommitmentKind } from "@/generated/prisma/client";
import { parseHm } from "@/lib/time";
import { prisma } from "../db";

export type CommitmentInput = {
  title: string;
  kind: CommitmentKind;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  location: string | null;
  flexible: boolean;
};

export async function listCommitments(userId: string) {
  return prisma.commitment.findMany({ where: { userId, active: true }, orderBy: [{ startTime: "asc" }] });
}

export async function createCommitment(userId: string, input: CommitmentInput) {
  return prisma.commitment.create({ data: { userId, ...input, daysOfWeek: [...new Set(input.daysOfWeek)].sort() } });
}

export async function updateCommitment(userId: string, id: string, input: CommitmentInput) {
  const res = await prisma.commitment.updateMany({
    where: { id, userId },
    data: { ...input, daysOfWeek: [...new Set(input.daysOfWeek)].sort() },
  });
  return res.count === 1;
}

export async function deleteCommitment(userId: string, id: string) {
  const res = await prisma.commitment.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Minutes a commitment occupies on one day (handles overnight spans such as sleep). */
export function commitmentMinutes(c: { startTime: string; endTime: string }) {
  const start = parseHm(c.startTime);
  const end = parseHm(c.endTime);
  return end > start ? end - start : 1440 - start + end;
}

/** Weekly committed minutes, used to sanity-check study targets. */
export function weeklyCommittedMinutes(commitments: { startTime: string; endTime: string; daysOfWeek: number[] }[]) {
  return commitments.reduce((sum, c) => sum + commitmentMinutes(c) * c.daysOfWeek.length, 0);
}
