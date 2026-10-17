import "server-only";
import { prisma } from "../db";

export async function listNotes(userId: string, topicId: string) {
  return prisma.note.findMany({
    where: { userId, topicId },
    orderBy: { updatedAt: "desc" },
    include: { flashcards: { select: { id: true, noteVersionAt: true } } },
  });
}

export async function createNote(userId: string, input: { topicId: string; title: string; content: string; origin?: "STUDENT" | "AI_DRAFT" }, at: Date) {
  const topic = await prisma.topic.findFirst({ where: { id: input.topicId, userId }, include: { syllabus: { select: { subjectId: true } } } });
  if (!topic) throw new Error("Topic not found");
  return prisma.note.create({
    data: {
      userId,
      topicId: topic.id,
      subjectId: topic.syllabus.subjectId,
      title: input.title,
      content: input.content,
      origin: input.origin ?? "STUDENT",
      contentUpdatedAt: at,
    },
  });
}

/** Editing an AI draft makes it the student's own ("MIXED"); flashcards from older versions become possibly outdated. */
export async function updateNote(userId: string, id: string, input: { title: string; content: string }, at: Date) {
  const note = await prisma.note.findFirst({ where: { id, userId } });
  if (!note) return null;
  const changed = note.content !== input.content;
  return prisma.note.update({
    where: { id },
    data: {
      title: input.title,
      content: input.content,
      ...(changed ? { contentUpdatedAt: at, origin: note.origin === "AI_DRAFT" ? "MIXED" : note.origin } : {}),
    },
  });
}

export async function deleteNote(userId: string, id: string) {
  const res = await prisma.note.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Draft notes from the latest lesson (the student edits them; nothing is overwritten). */
export async function draftNoteFromLesson(userId: string, topicId: string, at: Date) {
  const lesson = await prisma.lesson.findFirst({ where: { userId, topicId }, orderBy: { createdAt: "desc" } });
  if (!lesson) throw new Error("Open the lesson first, then draft notes from it.");
  const topic = await prisma.topic.findUniqueOrThrow({ where: { id: topicId } });
  const markdown = (lesson.content as { markdown: string }).markdown.replace(/\s?\[\[\d+\]\]/g, "");
  const summary = /##\s*Summary[\s\S]*?(?=\n##\s|$)/i.exec(markdown)?.[0];
  const content = `> Draft from the ${lesson.mode.toLowerCase()} lesson (${lesson.generatedBy === "MOCK" ? "simulated AI" : "AI-generated"}). Rewrite it in your own words — that's where the learning happens.\n\n${summary ?? markdown.slice(0, 4000)}`;
  return createNote(userId, { topicId, title: `${topic.title} — notes`, content, origin: "AI_DRAFT" }, at);
}
