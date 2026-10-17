import "server-only";
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import { z } from "zod";
import type { Flashcard } from "@/generated/prisma/client";
import { prisma } from "../db";
import { CORE_RULES, languageRules } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { getProfile } from "./profile";
import { awardXp } from "./xp";

const scheduler = fsrs({ enable_fuzz: false });

function toCard(f: Flashcard): Card {
  return {
    due: f.due,
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: f.elapsedDays,
    scheduled_days: f.scheduledDays,
    learning_steps: f.learningSteps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state as State,
    last_review: f.lastReview ?? undefined,
  };
}

function fromCard(c: Card) {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

export async function createFlashcard(
  userId: string,
  input: { front: string; back: string; topicId?: string | null; noteId?: string | null; mistakeId?: string | null; origin?: "STUDENT" | "AI" | "MOCK" | "MISTAKE" },
  at: Date,
) {
  if (input.topicId && !(await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true } }))) throw new Error("Topic not found");
  let noteVersionAt: Date | null = null;
  if (input.noteId) {
    const note = await prisma.note.findFirst({ where: { id: input.noteId, userId } });
    if (!note) throw new Error("Note not found");
    noteVersionAt = note.contentUpdatedAt;
  }
  return prisma.flashcard.create({
    data: {
      userId,
      front: input.front,
      back: input.back,
      topicId: input.topicId ?? null,
      noteId: input.noteId ?? null,
      mistakeId: input.mistakeId ?? null,
      origin: input.origin ?? "STUDENT",
      noteVersionAt,
      ...fromCard(createEmptyCard(at)),
    },
  });
}

const cardsSchema = z.object({ cards: z.array(z.object({ front: z.string(), back: z.string() })) });

/** Generate flashcards from a note (deliberate action). Replaces earlier AI cards from the same note. */
export async function generateCardsFromNote(userId: string, noteId: string, at: Date) {
  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!note) throw new Error("Note not found");
  const profile = await getProfile(userId);
  const ai = getAiProvider();
  const result = await withAi(userId, "flashcards_generate", (p) =>
    p.generateObject({
      feature: "flashcards_generate",
      userId,
      system: `${CORE_RULES}\n\n${languageRules(profile)}\n\n## Task: make flashcards from the student's own notes\nOne fact, definition, formula or step per card. Questions on the front, concise answers on the back. Use only what the notes say; do not add new facts. 5–12 cards.`,
      task: "Make flashcards from these notes.",
      references: [{ id: note.id, title: note.title, text: note.content }],
      schema: cardsSchema,
      effort: "low",
    }),
  );
  await prisma.flashcard.deleteMany({ where: { userId, noteId, origin: { in: ["AI", "MOCK"] }, reps: 0 } });
  const origin = ai?.name === "mock" ? "MOCK" : "AI";
  for (const c of result.data.cards.slice(0, 20)) {
    await createFlashcard(userId, { front: c.front, back: c.back, topicId: note.topicId, noteId, origin }, at);
  }
  return result.data.cards.length;
}

export async function createCardFromMistake(userId: string, mistakeId: string, at: Date) {
  const m = await prisma.mistake.findFirst({ where: { id: mistakeId, userId }, include: { question: true } });
  if (!m) throw new Error("Mistake not found");
  return createFlashcard(
    userId,
    {
      front: m.question?.prompt ?? m.title,
      back: [m.correctApproach, m.misconception ? `Avoid: ${m.misconception}` : null].filter(Boolean).join("\n\n") || m.whatWentWrong,
      topicId: m.topicId,
      mistakeId: m.id,
      origin: "MISTAKE",
    },
    at,
  );
}

export async function dueCards(userId: string, at: Date, opts: { topicId?: string; limit?: number } = {}) {
  return prisma.flashcard.findMany({
    where: { userId, suspended: false, due: { lte: at }, ...(opts.topicId ? { topicId: opts.topicId } : {}) },
    orderBy: [{ due: "asc" }],
    take: opts.limit ?? 50,
    include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } }, note: { select: { id: true, contentUpdatedAt: true } } },
  });
}

/** Preview intervals for each rating so the student sees what each button means. */
export function previewIntervals(card: Flashcard, at: Date) {
  const preview = scheduler.repeat(toCard(card), at);
  const out: Record<"again" | "hard" | "good" | "easy", Date> = {
    again: preview[Rating.Again].card.due,
    hard: preview[Rating.Hard].card.due,
    good: preview[Rating.Good].card.due,
    easy: preview[Rating.Easy].card.due,
  };
  return out;
}

export async function reviewCard(userId: string, cardId: string, rating: 1 | 2 | 3 | 4, at: Date) {
  const card = await prisma.flashcard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw new Error("Card not found");
  const { card: next, log } = scheduler.next(toCard(card), at, rating as Grade);
  await prisma.$transaction([
    prisma.flashcard.update({ where: { id: cardId }, data: fromCard(next) }),
    prisma.reviewLog.create({
      data: {
        flashcardId: cardId,
        userId,
        rating: log.rating,
        state: log.state,
        stability: log.stability,
        difficulty: log.difficulty,
        scheduledDays: log.scheduled_days,
        reviewedAt: at,
      },
    }),
  ]);
  await awardXp(userId, {
    action: "FLASHCARD_REVIEW",
    dedupeKey: `card:${cardId}:${at.toISOString().slice(0, 10)}`,
    reason: "Reviewed a flashcard",
    sourceType: "Flashcard",
    sourceId: cardId,
    at,
  });
  return next;
}

export async function deleteFlashcard(userId: string, id: string) {
  const res = await prisma.flashcard.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Cards made from a note before its latest edit may be outdated. */
export function isStale(card: { noteVersionAt: Date | null; note?: { contentUpdatedAt: Date } | null }) {
  return !!card.noteVersionAt && !!card.note && card.note.contentUpdatedAt.getTime() > card.noteVersionAt.getTime();
}

/** Anki-compatible tab-separated export. */
export async function exportCardsTsv(userId: string, topicId?: string) {
  const cards = await prisma.flashcard.findMany({ where: { userId, ...(topicId ? { topicId } : {}) }, orderBy: { createdAt: "asc" } });
  const clean = (s: string) => s.replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
  return cards.map((c) => `${clean(c.front)}\t${clean(c.back)}`).join("\n");
}
