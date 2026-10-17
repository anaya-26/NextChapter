import "server-only";
import { prisma } from "../db";

const PALETTE = ["#0e6b5c", "#1b5ea6", "#8a4fbf", "#c2410c", "#0f766e", "#b45309", "#be185d", "#4d7c0f"];

export async function listSubjects(userId: string) {
  return prisma.subject.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSubject(userId: string, id: string) {
  return prisma.subject.findFirst({ where: { id, userId } });
}

/** Creates subjects that don't exist yet (case-insensitive), keeping existing ones. */
export async function ensureSubjects(userId: string, names: string[]) {
  const existing = await prisma.subject.findMany({ where: { userId }, select: { name: true } });
  const have = new Set(existing.map((s) => s.name.toLowerCase()));
  let i = existing.length;
  for (const name of names) {
    const clean = name.trim();
    if (!clean || have.has(clean.toLowerCase())) continue;
    have.add(clean.toLowerCase());
    await prisma.subject.create({ data: { userId, name: clean, color: PALETTE[i++ % PALETTE.length] } });
  }
}

export async function createSubject(userId: string, input: { name: string; code?: string | null; examDate?: Date | null }) {
  const count = await prisma.subject.count({ where: { userId } });
  return prisma.subject.create({
    data: { userId, name: input.name, code: input.code ?? null, examDate: input.examDate ?? null, color: PALETTE[count % PALETTE.length] },
  });
}

export async function updateSubject(userId: string, id: string, input: { name: string; code: string | null; examDate: Date | null }) {
  const res = await prisma.subject.updateMany({ where: { id, userId }, data: input });
  return res.count === 1;
}

export async function archiveSubject(userId: string, id: string) {
  const res = await prisma.subject.updateMany({ where: { id, userId }, data: { status: "ARCHIVED" } });
  return res.count === 1;
}
