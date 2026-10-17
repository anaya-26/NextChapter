"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { enqueueJob } from "@/server/jobs/queue";
import { prisma } from "@/server/db";
import { createSubject, updateSubject, archiveSubject } from "@/server/services/subjects";
import {
  addRoadmapTopic,
  confirmSyllabus,
  createSyllabus,
  deleteTopic,
  moveTopic,
  outlineSchema,
  saveOutline,
  setTopicFamiliar,
  setTopicKind,
} from "@/server/services/syllabus";

export async function createSubjectAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      name: z.string().trim().min(2, "Name the subject").max(80),
      code: z.string().trim().max(30).optional(),
      examDate: z.string().optional(),
    })
    .safeParse({ name: form.get("name"), code: form.get("code") || undefined, examDate: form.get("examDate") || undefined });
  if (!r.success) return fail("Please check the subject details.", { name: r.error.issues[0]?.message ?? "Invalid" });
  const subject = await createSubject(user.id, {
    name: r.data.name,
    code: r.data.code ?? null,
    examDate: r.data.examDate ? new Date(`${r.data.examDate}T00:00:00Z`) : null,
  });
  redirect(`/learn/${subject.id}/syllabus/new`);
}

export async function updateSubjectAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return fail("Name the subject", { name: "Too short" });
  const examDate = String(form.get("examDate") ?? "");
  await updateSubject(user.id, id, {
    name,
    code: String(form.get("code") ?? "").trim() || null,
    examDate: examDate ? new Date(`${examDate}T00:00:00Z`) : null,
  });
  refresh();
  return { ok: true, message: "Subject updated" };
}

export async function archiveSubjectAction(id: string) {
  const user = await requireUser();
  await archiveSubject(user.id, id);
  redirect("/learn");
}

export async function uploadSyllabusAction(subjectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pastedText = String(form.get("pastedText") ?? "");
  const language = String(form.get("language") ?? "en");
  let syllabusId: string;
  try {
    const incoming = await Promise.all(
      files.map(async (f) => ({ fileName: f.name, mime: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) })),
    );
    const { syllabus } = await createSyllabus(user.id, {
      subjectId,
      title: String(form.get("title") ?? "").trim(),
      files: incoming,
      pastedText,
      language,
    });
    syllabusId = syllabus.id;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload failed");
  }
  redirect(`/learn/${subjectId}/syllabus/${syllabusId}`);
}

export async function saveOutlineAction(syllabusId: string, intent: "save" | "confirm", _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let json: unknown;
  try {
    json = JSON.parse(String(form.get("outline") ?? "{}"));
  } catch {
    return fail("Could not read the edited outline");
  }
  const r = outlineSchema.safeParse(json);
  if (!r.success) return fail(r.error.issues[0]?.message ?? "Please check the outline");
  let confirmedSubjectId: string | null = null;
  try {
    await saveOutline(user.id, syllabusId, r.data);
    if (intent === "confirm") {
      await confirmSyllabus(user.id, syllabusId, await now(user.id));
      const s = await prisma.syllabus.findUniqueOrThrow({ where: { id: syllabusId }, select: { subjectId: true } });
      confirmedSubjectId = s.subjectId;
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save");
  }
  if (confirmedSubjectId) redirect(`/learn/${confirmedSubjectId}?confirmed=1`);
  refresh();
  return { ok: true, message: "Draft saved" };
}

export async function retryExtraction(syllabusId: string) {
  const user = await requireUser();
  const s = await prisma.syllabus.findFirst({ where: { id: syllabusId, userId: user.id } });
  if (!s) return;
  await prisma.syllabus.update({ where: { id: syllabusId }, data: { status: "EXTRACTING" } });
  await enqueueJob("syllabus.extract", { syllabusId }, { userId: user.id, dedupeKey: `syllabus-extract:${syllabusId}` });
  refresh();
}

export async function reopenSyllabus(syllabusId: string) {
  const user = await requireUser();
  const s = await prisma.syllabus.findFirst({ where: { id: syllabusId, userId: user.id } });
  if (!s) return;
  redirect(`/learn/${s.subjectId}/syllabus/${s.id}?edit=1`);
}

export async function topicAction(
  topicId: string,
  op: "familiar" | "unfamiliar" | "up" | "down" | "required" | "background" | "optional" | "delete",
) {
  const user = await requireUser();
  switch (op) {
    case "familiar":
      await setTopicFamiliar(user.id, topicId, true);
      break;
    case "unfamiliar":
      await setTopicFamiliar(user.id, topicId, false);
      break;
    case "up":
    case "down":
      await moveTopic(user.id, topicId, op);
      break;
    case "required":
      await setTopicKind(user.id, topicId, "REQUIRED");
      break;
    case "background":
      await setTopicKind(user.id, topicId, "BACKGROUND");
      break;
    case "optional":
      await setTopicKind(user.id, topicId, "OPTIONAL");
      break;
    case "delete":
      await deleteTopic(user.id, topicId);
      break;
  }
  refresh();
}

export async function addTopicAction(syllabusId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim();
  const kind = String(form.get("kind") ?? "BACKGROUND");
  const unitId = String(form.get("unitId") ?? "") || null;
  if (title.length < 2) return fail("Name the topic", { title: "Too short" });
  if (!["REQUIRED", "BACKGROUND", "OPTIONAL"].includes(kind)) return fail("Invalid kind");
  const t = await addRoadmapTopic(user.id, syllabusId, { title: title.slice(0, 200), kind: kind as "REQUIRED", unitId });
  if (!t) return fail("Syllabus not found");
  refresh();
  return { ok: true, message: "Topic added" };
}
