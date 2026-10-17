import "server-only";
import { prisma } from "../db";
import { awardXp } from "./xp";

export async function addMistakeFromAttempt(userId: string, attemptId: string, input: { whatWentWrong: string; correctApproach?: string | null; misconception?: string | null }) {
  const attempt = await prisma.practiceAttempt.findFirst({ where: { id: attemptId, userId }, include: { question: true } });
  if (!attempt) throw new Error("Attempt not found");
  const existing = await prisma.mistake.findFirst({ where: { userId, questionId: attempt.questionId, status: { not: "RESOLVED" } } });
  if (existing) return existing;
  return prisma.mistake.create({
    data: {
      userId,
      topicId: attempt.topicId,
      questionId: attempt.questionId,
      attemptId,
      title: attempt.question.prompt.slice(0, 140),
      whatWentWrong: input.whatWentWrong,
      correctApproach: input.correctApproach ?? attempt.question.explanation ?? null,
      misconception: input.misconception ?? null,
    },
  });
}

export async function addOwnMistake(userId: string, input: { topicId: string | null; title: string; whatWentWrong: string; correctApproach: string | null }) {
  if (input.topicId && !(await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true } }))) throw new Error("Topic not found");
  return prisma.mistake.create({ data: { userId, ...input } });
}

export async function listMistakes(userId: string, filter: "open" | "resolved" | "all" = "open") {
  return prisma.mistake.findMany({
    where: { userId, ...(filter === "open" ? { status: { not: "RESOLVED" } } : filter === "resolved" ? { status: "RESOLVED" } : {}) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } },
      question: { select: { id: true, prompt: true, explanation: true, practiceSetId: true } },
      flashcards: { select: { id: true } },
    },
  });
}

/** Revisiting a mistake (reading the explanation, re-trying) earns XP once per day per mistake. */
export async function reviewMistake(userId: string, id: string, at: Date) {
  const m = await prisma.mistake.findFirst({ where: { id, userId } });
  if (!m) return null;
  const updated = await prisma.mistake.update({
    where: { id },
    data: { reviewCount: { increment: 1 }, status: m.status === "OPEN" ? "PRACTISING" : m.status, nextReviewAt: new Date(at.getTime() + 3 * 86400000) },
  });
  await awardXp(userId, { action: "MISTAKE_REVIEW", dedupeKey: `mistake:${id}:${at.toISOString().slice(0, 10)}`, reason: "Revisited a mistake", sourceType: "Mistake", sourceId: id, at });
  return updated;
}

export async function resolveMistake(userId: string, id: string, at: Date) {
  const res = await prisma.mistake.updateMany({ where: { id, userId }, data: { status: "RESOLVED", resolvedAt: at } });
  if (res.count) await awardXp(userId, { action: "MISTAKE_REVIEW", points: 10, dedupeKey: `mistake-resolved:${id}`, reason: "Resolved a mistake", sourceType: "Mistake", sourceId: id, at });
  return res.count === 1;
}

export async function deleteMistake(userId: string, id: string) {
  const res = await prisma.mistake.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Recurring difficulties: topics with several open mistakes. */
export async function recurringDifficulties(userId: string) {
  const groups = await prisma.mistake.groupBy({ by: ["topicId"], where: { userId, status: { not: "RESOLVED" }, topicId: { not: null } }, _count: true });
  const frequent = groups.filter((g) => g._count >= 2);
  const topics = await prisma.topic.findMany({ where: { id: { in: frequent.map((g) => g.topicId!) } }, select: { id: true, title: true } });
  return frequent.map((g) => ({ topic: topics.find((t) => t.id === g.topicId)!, count: g._count })).filter((x) => x.topic);
}
