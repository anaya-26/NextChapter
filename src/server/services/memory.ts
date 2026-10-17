import "server-only";
import type { MemoryCertainty, MemoryKind, MemorySource, Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { getPrivacy } from "./profile";

/**
 * The companion's memory. Every item is visible to the student, who can confirm,
 * correct or delete it. Inferred items stay TENTATIVE until the student confirms them.
 */

export async function listMemories(userId: string) {
  return prisma.memoryItem.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    include: { journalEntry: { select: { id: true, date: true } } },
  });
}

export async function addMemory(
  userId: string,
  input: {
    content: string;
    kind: MemoryKind;
    source: MemorySource;
    certainty?: MemoryCertainty;
    evidence?: string | null;
    journalEntryId?: string | null;
    conversationId?: string | null;
  },
) {
  const privacy = await getPrivacy(userId);
  if (!privacy.aiMemoryEnabled && input.source !== "STUDENT") return null;
  if (input.source === "INFERRED" && !privacy.aiInferPatterns) return null;
  // Avoid duplicates of the same statement.
  const existing = await prisma.memoryItem.findFirst({
    where: { userId, status: "ACTIVE", content: { equals: input.content, mode: "insensitive" } },
  });
  if (existing) return existing;
  return prisma.memoryItem.create({
    data: {
      userId,
      content: input.content,
      kind: input.kind,
      source: input.source,
      certainty: input.certainty ?? (input.source === "STUDENT" ? "STATED" : "TENTATIVE"),
      evidence: input.evidence ?? null,
      journalEntryId: input.journalEntryId ?? null,
      conversationId: input.conversationId ?? null,
    },
  });
}

export async function confirmMemory(userId: string, id: string) {
  const res = await prisma.memoryItem.updateMany({ where: { id, userId }, data: { certainty: "CONFIRMED" } });
  return res.count === 1;
}

/** Student correction: replaces the content and marks it confirmed; keeps the old wording for transparency. */
export async function correctMemory(userId: string, id: string, content: string) {
  const item = await prisma.memoryItem.findFirst({ where: { id, userId } });
  if (!item) return false;
  await prisma.memoryItem.update({
    where: { id },
    data: { content, correctedFrom: item.correctedFrom ?? item.content, certainty: "CONFIRMED", source: item.source },
  });
  return true;
}

/** Hard delete: the item is gone from all future personalisation. */
export async function deleteMemory(userId: string, id: string) {
  const res = await prisma.memoryItem.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

export async function deleteAllMemories(userId: string) {
  const res = await prisma.memoryItem.deleteMany({ where: { userId } });
  return res.count;
}

/** Memories the AI may use right now (respects the master switch). */
export async function memoriesForAi(userId: string) {
  const privacy = await getPrivacy(userId);
  if (!privacy.aiMemoryEnabled) return [];
  const conditions: Prisma.MemoryItemWhereInput[] = [
    // Journal-derived memories are only usable while journal access remains permitted.
    privacy.aiUseJournal
      ? { OR: [{ journalEntryId: null }, { journalEntry: { aiAccess: true } }] }
      : { journalEntryId: null },
  ];
  if (!privacy.aiInferPatterns) conditions.push({ source: { not: "INFERRED" } });
  return prisma.memoryItem.findMany({
    where: { userId, status: "ACTIVE", AND: conditions },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
}
