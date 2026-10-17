"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/action";
import { splitList } from "@/lib/utils";
import { localDateKey } from "@/lib/time";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { describeAiError } from "@/server/ai";
import { getProfile, updateProfile } from "@/server/services/profile";
import { createEntry, deleteEntry, updateEntry, type UploadedFile } from "@/server/services/journal";
import { generateWeeklyReview } from "@/server/services/weekly-review";
import { acceptSuggestion, dismissSuggestion } from "@/server/services/suggestions";
import { abandonExperiment, completeExperiment, proposeExperiment, startExperiment } from "@/server/services/experiments";
import type { ExperimentMetric } from "@/lib/experiments";

const scale = z.coerce.number().int().min(1).max(5).optional();

async function filesFrom(form: FormData, key: string): Promise<UploadedFile[]> {
  const files = form.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(files.map(async (f) => ({ fileName: f.name || "file", mime: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) })));
}

export async function checkInAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z.object({ mood: z.coerce.number().int().min(1).max(5), energy: scale, text: z.string().trim().max(500) }).safeParse({ mood: form.get("mood"), energy: form.get("energy") || undefined, text: form.get("text") ?? "" });
  if (!r.success) return fail("Pick how you're feeling", fieldErrorsFrom(r.error));
  const at = await now(user.id);
  const profile = await getProfile(user.id);
  const { xp } = await createEntry(user.id, { kind: "CHECK_IN", dateKey: localDateKey(at, profile.timezone), mood: r.data.mood, energy: r.data.energy ?? null, text: r.data.text || null, aiAccess: form.get("aiAccess") === "on" }, at);
  refresh();
  return { ok: true, message: xp && !profile.quietMode ? `Checked in · +${xp} XP` : "Checked in" };
}

const entrySchema = z.object({
  kind: z.enum(["REFLECTION", "NOTE", "VOICE"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(160),
  text: z.string().trim().max(20000),
  achievements: z.string().trim().max(4000),
  difficulties: z.string().trim().max(4000),
  plannedSummary: z.string().trim().max(1000),
  actualSummary: z.string().trim().max(1000),
  topics: z.string().max(1000),
  mood: scale,
  energy: scale,
});

export async function createEntryAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const get = (k: string) => String(form.get(k) ?? "");
  const r = entrySchema.safeParse({
    kind: get("kind") || "REFLECTION",
    date: get("date"),
    title: get("title"),
    text: get("text"),
    achievements: get("achievements"),
    difficulties: get("difficulties"),
    plannedSummary: get("plannedSummary"),
    actualSummary: get("actualSummary"),
    topics: form.getAll("topics").map(String).join(","),
    mood: get("mood") || undefined,
    energy: get("energy") || undefined,
  });
  if (!r.success) return fail("Please check the entry.", fieldErrorsFrom(r.error));
  const photos = await filesFrom(form, "photos");
  const [voice] = await filesFrom(form, "voice");
  if (!r.data.text && !r.data.achievements && !r.data.difficulties && !voice && !photos.length) return fail("Write something, add a photo or record a voice note.", { text: "Empty" });
  try {
    const { entry, xp } = await createEntry(
      user.id,
      {
        kind: voice && !r.data.text ? "VOICE" : r.data.kind,
        dateKey: r.data.date,
        title: r.data.title || null,
        text: r.data.text || null,
        achievements: r.data.achievements || null,
        difficulties: r.data.difficulties || null,
        plannedSummary: r.data.plannedSummary || null,
        actualSummary: r.data.actualSummary || null,
        topicsStudied: splitList(r.data.topics, 12),
        mood: r.data.mood ?? null,
        energy: r.data.energy ?? null,
        aiAccess: form.get("aiAccess") === "on",
        photos,
        voice: voice ?? null,
      },
      await now(user.id),
    );
    refresh();
    const profile = await getProfile(user.id);
    return { ok: true, message: xp && !profile.quietMode ? `Saved · +${xp} XP` : "Saved to your journal", data: { id: entry.id } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save");
  }
}

export async function updateEntryAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  try {
    await updateEntry(user.id, id, {
      title: get("title").slice(0, 160) || null,
      text: get("text").slice(0, 20000) || null,
      achievements: get("achievements").slice(0, 4000) || null,
      difficulties: get("difficulties").slice(0, 4000) || null,
      topicsStudied: splitList(form.getAll("topics").map(String).join(","), 12),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save");
  }
  refresh();
  return { ok: true, message: "Saved" };
}

export async function setEntryAiAccessAction(id: string, allowed: boolean) {
  const user = await requireUser();
  await updateEntry(user.id, id, { aiAccess: allowed });
  refresh();
}

export async function deleteEntryAction(id: string) {
  const user = await requireUser();
  await deleteEntry(user.id, id);
  redirect("/journal?deleted=1");
}

export async function generateReviewAction(weekKey: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return fail("Invalid week");
  try {
    await generateWeeklyReview(user.id, weekKey, await now(user.id));
  } catch (e) {
    return fail(describeAiError(e));
  }
  refresh();
  return { ok: true, message: "Weekly review ready" };
}

export async function acceptSuggestionAction(id: string): Promise<{ href?: string; error?: string; message?: string }> {
  const user = await requireUser();
  try {
    const r = await acceptSuggestion(user.id, id, await now(user.id));
    refresh();
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't do that" };
  }
}

export async function dismissSuggestionAction(id: string) {
  const user = await requireUser();
  await dismissSuggestion(user.id, id, await now(user.id));
  refresh();
}

/* ── Experiments & progress settings ──────────────────────────────── */

export async function proposeExperimentAction(templateId: string) {
  const user = await requireUser();
  await proposeExperiment(user.id, { templateId }, "STUDENT");
  refresh();
}

export async function customExperimentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      title: z.string().trim().min(3, "Name it").max(120),
      change: z.string().trim().min(5, "What will you change?").max(400),
      hypothesis: z.string().trim().min(5, "What do you expect?").max(400),
      metric: z.enum(["session_completion", "study_minutes", "recall", "practice_accuracy"]),
      days: z.coerce.number().int().min(5).max(28),
    })
    .safeParse(Object.fromEntries(form));
  if (!r.success) return fail("Please complete the experiment.", fieldErrorsFrom(r.error));
  await proposeExperiment(user.id, { ...r.data, metric: r.data.metric as ExperimentMetric }, "STUDENT");
  refresh();
  return { ok: true, message: "Experiment added — start it when you're ready" };
}

export async function startExperimentAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await startExperiment(user.id, id, await now(user.id));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't start");
  }
  refresh();
  return { ok: true, message: "Experiment started — good luck!" };
}

export async function completeExperimentAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const verdict = String(form.get("verdict") ?? "");
  if (!["HELPED", "NO_CHANGE", "WORSE", "UNSURE"].includes(verdict)) return fail("How did it go?", { verdict: "Pick one" });
  const { xp } = await completeExperiment(user.id, id, { verdict: verdict as "HELPED", reflection: String(form.get("reflection") ?? "").trim().slice(0, 2000) || null }, await now(user.id));
  refresh();
  const profile = await getProfile(user.id);
  return { ok: true, message: xp.awarded && !profile.quietMode ? `Experiment reviewed · +${xp.points} XP` : "Experiment reviewed" };
}

export async function abandonExperimentAction(id: string) {
  const user = await requireUser();
  await abandonExperiment(user.id, id);
  refresh();
}

export async function setDisplayPrefsAction(prefs: { quietMode?: boolean; showGrowthVisual?: boolean }) {
  const user = await requireUser();
  await updateProfile(user.id, { ...(prefs.quietMode !== undefined ? { quietMode: prefs.quietMode } : {}), ...(prefs.showGrowthVisual !== undefined ? { showGrowthVisual: prefs.showGrowthVisual } : {}) });
  refresh();
}
