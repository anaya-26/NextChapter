"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { describeAiError } from "@/server/ai";
import { requestLesson } from "@/server/services/lessons";
import { createNote, deleteNote, draftNoteFromLesson, updateNote } from "@/server/services/notes";
import { createCardFromMistake, createFlashcard, deleteFlashcard, generateCardsFromNote, reviewCard } from "@/server/services/flashcards";
import { createOwnQuestion, evaluateUnderstanding, generatePracticeSet, gradeAttempt, selfAssess, type AttemptInput, type GradeResult } from "@/server/services/practice";
import { addMistakeFromAttempt, addOwnMistake, deleteMistake, resolveMistake, reviewMistake } from "@/server/services/mistakes";
import { completeRevision, markStudied, scheduleRevision, skipRevision } from "@/server/services/revision";
import { addOwnResource, discoverResources, setResourceFlags } from "@/server/services/resources";
import { addPastedMaterial, deleteMaterial, retrySource } from "@/server/services/sources";

const aiFail = (e: unknown) => fail(describeAiError(e));

/* ── Lessons & status ─────────────────────────────────────────────── */

export async function requestLessonAction(topicId: string, mode: "SIMPLE" | "STANDARD" | "DEEP" | "EXAM") {
  const user = await requireUser();
  await requestLesson(user.id, topicId, mode);
  refresh();
}

export async function markStudiedAction(topicId: string, schedule: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const { revision } = await markStudied(user.id, topicId, await now(user.id), { scheduleRevision: schedule });
  refresh();
  return { ok: true, message: revision ? "Marked as studied — first revision scheduled for tomorrow" : "Marked as studied" };
}

/* ── Notes ────────────────────────────────────────────────────────── */

const noteSchema = z.object({ title: z.string().trim().min(1, "Give the note a title").max(160), content: z.string().max(100_000) });

export async function saveNoteAction(topicId: string, noteId: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = noteSchema.safeParse({ title: form.get("title"), content: form.get("content") ?? "" });
  if (!r.success) return fail("Please check the note.", { title: r.error.issues[0]?.message ?? "Invalid" });
  const at = await now(user.id);
  if (noteId) await updateNote(user.id, noteId, r.data, at);
  else await createNote(user.id, { topicId, ...r.data }, at);
  refresh();
  return { ok: true, message: "Note saved" };
}

export async function deleteNoteAction(noteId: string) {
  const user = await requireUser();
  await deleteNote(user.id, noteId);
  refresh();
}

export async function draftNoteAction(topicId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await draftNoteFromLesson(user.id, topicId, await now(user.id));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not draft notes");
  }
  refresh();
  return { ok: true, message: "Draft notes added — edit them in your own words" };
}

export async function generateCardsAction(noteId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const n = await generateCardsFromNote(user.id, noteId, await now(user.id));
    refresh();
    return { ok: true, message: `${n} flashcards made from your note` };
  } catch (e) {
    return aiFail(e);
  }
}

/* ── Flashcards ───────────────────────────────────────────────────── */

export async function createCardAction(topicId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const front = String(form.get("front") ?? "").trim();
  const back = String(form.get("back") ?? "").trim();
  if (!front || !back) return fail("Fill in both sides of the card", { front: front ? "" : "Required", back: back ? "" : "Required" });
  await createFlashcard(user.id, { front: front.slice(0, 1000), back: back.slice(0, 2000), topicId }, await now(user.id));
  refresh();
  return { ok: true, message: "Flashcard added" };
}

export async function deleteCardAction(id: string) {
  const user = await requireUser();
  await deleteFlashcard(user.id, id);
  refresh();
}

export async function reviewCardAction(id: string, rating: 1 | 2 | 3 | 4) {
  const user = await requireUser();
  const next = await reviewCard(user.id, id, rating, await now(user.id));
  return { due: next.due.toISOString() };
}

/* ── Practice ─────────────────────────────────────────────────────── */

export async function generatePracticeAction(topicId: string, mode: "QUICK_CHECK" | "NUMERICAL" | "WRITTEN" | "TEACH_BACK" | "EXAM" | "MIXED"): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await generatePracticeSet(user.id, topicId, mode);
  } catch (e) {
    return aiFail(e);
  }
  refresh();
  return { ok: true, message: "Practice ready" };
}

export async function submitAttemptAction(questionId: string, input: AttemptInput): Promise<GradeResult | { error: string }> {
  const user = await requireUser();
  try {
    return await gradeAttempt(user.id, questionId, input, await now(user.id));
  } catch (e) {
    return { error: describeAiError(e) };
  }
}

export async function selfAssessAction(attemptId: string, covered: string[]) {
  const user = await requireUser();
  return selfAssess(user.id, attemptId, covered, await now(user.id));
}

export async function checkUnderstandingAction(practiceSetId: string) {
  const user = await requireUser();
  const result = await evaluateUnderstanding(user.id, practiceSetId, await now(user.id));
  refresh();
  return result;
}

export async function createQuestionAction(topicId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      type: z.enum(["SHORT_ANSWER", "MCQ", "NUMERICAL"]),
      prompt: z.string().trim().min(5, "Write the question").max(2000),
      answer: z.string().trim().min(1, "Give the answer").max(2000),
      explanation: z.string().trim().max(2000).optional(),
    })
    .safeParse({ type: form.get("type"), prompt: form.get("prompt"), answer: form.get("answer"), explanation: form.get("explanation") || undefined });
  if (!r.success) return fail("Please complete the question.", Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
  const options = form.getAll("options").map(String).filter((o) => o.trim());
  if (r.data.type === "MCQ" && !options.some((o) => o.trim().toLowerCase() === r.data.answer.toLowerCase())) {
    return fail("For a multiple-choice question, the answer must match one of the options.", { answer: "Must match an option" });
  }
  await createOwnQuestion(user.id, topicId, { ...r.data, options });
  refresh();
  return { ok: true, message: "Question added to “My own questions”" };
}

export async function addMistakeAction(attemptId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const whatWentWrong = String(form.get("whatWentWrong") ?? "").trim();
  if (whatWentWrong.length < 3) return fail("Describe what went wrong", { whatWentWrong: "Too short" });
  await addMistakeFromAttempt(user.id, attemptId, { whatWentWrong, misconception: String(form.get("misconception") ?? "").trim() || null });
  return { ok: true, message: "Added to your mistake library" };
}

/* ── Mistakes ─────────────────────────────────────────────────────── */

export async function mistakeAction(id: string, op: "review" | "resolve" | "card" | "delete") {
  const user = await requireUser();
  const at = await now(user.id);
  if (op === "review") await reviewMistake(user.id, id, at);
  if (op === "resolve") await resolveMistake(user.id, id, at);
  if (op === "card") await createCardFromMistake(user.id, id, at);
  if (op === "delete") await deleteMistake(user.id, id);
  refresh();
}

export async function addOwnMistakeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim();
  const whatWentWrong = String(form.get("whatWentWrong") ?? "").trim();
  if (!title || !whatWentWrong) return fail("Add a title and what went wrong");
  await addOwnMistake(user.id, {
    topicId: String(form.get("topicId") ?? "") || null,
    title: title.slice(0, 160),
    whatWentWrong: whatWentWrong.slice(0, 2000),
    correctApproach: String(form.get("correctApproach") ?? "").trim() || null,
  });
  refresh();
  return { ok: true, message: "Mistake recorded" };
}

/* ── Revision ─────────────────────────────────────────────────────── */

export async function scheduleRevisionAction(topicId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const dateKey = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return fail("Choose a date and time");
  await scheduleRevision(user.id, { topicId, dateKey, time, kind: (String(form.get("kind") ?? "QUIZ") as "QUIZ"), durationMinutes: Number(form.get("minutes") ?? 20) || 20 }, await now(user.id));
  refresh();
  return { ok: true, message: "Revision scheduled and added to your calendar" };
}

export async function completeRevisionAction(taskId: string, recallPercent: number): Promise<ActionResult> {
  const user = await requireUser();
  const { next } = await completeRevision(user.id, taskId, Math.max(0, Math.min(100, recallPercent)) / 100, await now(user.id));
  refresh();
  return { ok: true, message: next ? `Revision done. Next one scheduled in ${next.intervalDays} day${next.intervalDays === 1 ? "" : "s"}.` : "Revision done" };
}

export async function skipRevisionAction(taskId: string) {
  const user = await requireUser();
  await skipRevision(user.id, taskId);
  refresh();
}

/* ── Resources ────────────────────────────────────────────────────── */

export async function discoverResourcesAction(topicId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const found = await discoverResources(user.id, topicId);
    refresh();
    return { ok: true, message: found.length ? `${found.length} resources found` : "No suitable new resources found — try the directory links" };
  } catch (e) {
    return fail(e instanceof Error && !e.name.startsWith("Ai") ? e.message : describeAiError(e));
  }
}

export async function addResourceAction(topicId: string | null, subjectId: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await addOwnResource(user.id, {
      topicId,
      subjectId,
      title: String(form.get("title") ?? "").trim().slice(0, 200) || String(form.get("url") ?? ""),
      url: String(form.get("url") ?? "").trim(),
      type: (String(form.get("type") ?? "OTHER") as "OTHER"),
      cost: (String(form.get("cost") ?? "UNKNOWN") as "UNKNOWN"),
      note: String(form.get("note") ?? "").trim() || null,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not add the link", { url: "Check the link" });
  }
  refresh();
  return { ok: true, message: "Resource saved" };
}

export async function resourceFlagAction(id: string, flags: { saved?: boolean; dismissed?: boolean }) {
  const user = await requireUser();
  await setResourceFlags(user.id, id, flags);
  refresh();
}

/* ── Materials ────────────────────────────────────────────────────── */

export async function deleteMaterialAction(id: string) {
  const user = await requireUser();
  await deleteMaterial(user.id, id);
  refresh();
}

export async function retrySourceAction(id: string) {
  const user = await requireUser();
  await retrySource(user.id, id);
  refresh();
}

export async function addPastedMaterialAction(subjectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim() || "Pasted notes";
  const text = String(form.get("text") ?? "").trim();
  if (text.length < 20) return fail("Paste at least a paragraph", { text: "Too short" });
  await addPastedMaterial(user.id, subjectId, title, text);
  refresh();
  return { ok: true, message: "Added — processing" };
}
