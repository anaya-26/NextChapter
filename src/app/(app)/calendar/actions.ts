"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { dailyRule, weeklyRule } from "@/lib/recurrence";
import { DAY_PARTS } from "@/lib/planner";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { createEvent, deleteEvent, eventTimes, findConflicts, setEventStatus, updateEvent, type EventInput } from "@/server/services/calendar";
import { draftFromText } from "@/server/services/schedule-text";
import { applyPlan, clearFuturePlan, type PlanOptions } from "@/server/services/planner";
import { applyRestart, type RestartMode } from "@/server/services/restart";
import { finishSession, logStudy, missSession, resolveObstacle, startAdHocSession, startSession, OBSTACLE_REASONS } from "@/server/services/sessions";
import { getProfile } from "@/server/services/profile";
import { applyChanges, disconnect, rejectChange, resolveConflict, syncNow, updateSyncKinds } from "@/server/services/calendar-sync";

const KINDS = ["CLASS", "ASSIGNMENT", "EXAM", "REVISION", "STUDY", "PROJECT", "FOCUS", "APPLICATION", "PERSONAL", "REMINDER"] as const;

/* ── Events ───────────────────────────────────────────────────────── */

export async function draftEventAction(text: string) {
  const user = await requireUser();
  if (!text.trim()) return { error: "Type what you want to add, e.g. “Chemistry test on 23/10 at 10am”." };
  const r = await draftFromText(user.id, text.slice(0, 400), await now(user.id));
  return r ?? { error: "Couldn't read a date or time from that — try “Physics revision tomorrow 7pm”." };
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(160),
    kind: z.enum(KINDS),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    allDay: z.boolean(),
    start: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")),
    duration: z.coerce.number().int().min(5, "At least 5 minutes").max(24 * 60),
    repeat: z.enum(["NONE", "DAILY", "WEEKLY"]),
    days: z.array(z.coerce.number().int().min(0).max(6)),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
    reminder: z.string(),
    countdown: z.boolean(),
    deadline: z.boolean(),
    estimate: z.coerce.number().int().min(0).max(100 * 60).optional(),
    location: z.string().trim().max(200),
    description: z.string().trim().max(2000),
    topicId: z.string().optional(),
  })
  .refine((v) => v.allDay || v.start !== "", { message: "Choose a start time", path: ["start"] })
  .refine((v) => v.repeat !== "WEEKLY" || v.days.length > 0, { message: "Pick at least one day", path: ["days"] });

function toInput(v: z.infer<typeof eventSchema>): EventInput {
  return {
    title: v.title,
    kind: v.kind,
    dateKey: v.date,
    startTime: v.allDay ? null : v.start,
    durationMinutes: v.allDay ? Math.max(1440, v.duration) : v.duration,
    allDay: v.allDay,
    rrule: v.repeat === "DAILY" ? dailyRule(v.until || null) : v.repeat === "WEEKLY" ? weeklyRule(v.days, v.until || null) : null,
    reminderMinutes: v.reminder.split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0),
    showCountdown: v.countdown,
    isDeadline: v.deadline,
    estimatedMinutes: v.estimate || null,
    location: v.location || null,
    description: v.description || null,
    topicId: v.topicId || null,
  };
}

function parseEventForm(form: FormData) {
  const o = formToObject(form, ["days"]);
  return eventSchema.safeParse({ ...o, allDay: o.allDay === "on", countdown: o.countdown === "on", deadline: o.deadline === "on", estimate: o.estimate || undefined, topicId: o.topicId || undefined });
}

export async function saveEventAction(eventId: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = parseEventForm(form);
  if (!r.success) return fail("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  try {
    if (eventId) await updateEvent(user.id, eventId, toInput(r.data));
    else await createEvent(user.id, toInput(r.data));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save");
  }
  refresh();
  return { ok: true, message: eventId ? "Saved" : "Added to your calendar" };
}

export async function checkConflictsAction(input: { date: string; start: string; duration: number; excludeId?: string | null }) {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.start)) return [];
  const profile = await getProfile(user.id);
  const t = eventTimes({ dateKey: input.date, startTime: input.start, durationMinutes: Math.max(5, input.duration || 30), allDay: false }, profile.timezone);
  const items = await findConflicts(user.id, t.startAt, t.endAt, { excludeEventId: input.excludeId });
  return items.map((c) => ({ title: c.title, start: c.start.toISOString(), end: c.end.toISOString(), kind: c.kind }));
}

export async function deleteEventAction(id: string) {
  const user = await requireUser();
  await deleteEvent(user.id, id);
  refresh();
}

export async function setEventStatusAction(id: string, status: "DONE" | "CONFIRMED" | "CANCELLED") {
  const user = await requireUser();
  await setEventStatus(user.id, id, status);
  refresh();
}

/* ── Planner & restart ────────────────────────────────────────────── */

const planOptionsSchema = z.object({
  days: z.number().int().min(1).max(21).optional(),
  extraMinutesPerDay: z.number().int().min(0).max(240).optional(),
  subjectIds: z.array(z.string()).nullable().optional(),
  quickReview: z.boolean().optional(),
  deadlinesOnly: z.boolean().optional(),
  includeOptional: z.boolean().optional(),
  ignoreExistingPlan: z.boolean().optional(),
});

export async function applyPlanAction(options: PlanOptions, replace: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const opts = planOptionsSchema.parse(options);
  const at = await now(user.id);
  if (replace) await clearFuturePlan(user.id, at);
  const r = await applyPlan(user.id, at, opts);
  refresh();
  return { ok: true, message: r.created ? `${r.created} study sessions added to your calendar` : "Nothing new to plan" };
}

export async function clearPlanAction(): Promise<ActionResult> {
  const user = await requireUser();
  const n = await clearFuturePlan(user.id, await now(user.id));
  refresh();
  return { ok: true, message: `Removed ${n} planned sessions` };
}

export async function applyRestartAction(mode: RestartMode) {
  const user = await requireUser();
  if (!["FRESH_START", "CATCH_UP", "EXAM_FIRST"].includes(mode)) throw new Error("Unknown option");
  await applyRestart(user.id, mode, await now(user.id));
  redirect("/today?restarted=1");
}

/* ── Sessions ─────────────────────────────────────────────────────── */

export async function startSessionAction(id: string) {
  const user = await requireUser();
  await startSession(user.id, id, await now(user.id));
  redirect(`/study/${id}`);
}

export async function startFocusAction(input: { topicId?: string | null; title?: string; minutes: number }) {
  const user = await requireUser();
  const s = await startAdHocSession(user.id, { title: input.title ?? "", topicId: input.topicId ?? null, plannedMinutes: Math.max(5, Math.min(180, input.minutes)) }, await now(user.id));
  redirect(`/study/${s.id}`);
}

const finishSchema = z.object({
  actualMinutes: z.coerce.number().int().min(0).max(600),
  difficulties: z.string().trim().max(2000),
  achievements: z.string().trim().max(2000),
  energy: z.coerce.number().int().min(1).max(5).optional(),
  focusQuality: z.coerce.number().int().min(1).max(5).optional(),
  topicDone: z.boolean(),
});

export async function finishSessionAction(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const o = formToObject(form);
  const r = finishSchema.safeParse({ ...o, energy: o.energy || undefined, focusQuality: o.focusQuality || undefined, topicDone: o.topicDone === "on" });
  if (!r.success) return fail("Please check the form.", fieldErrorsFrom(r.error));
  const { xp } = await finishSession(user.id, id, r.data, await now(user.id));
  refresh();
  return { ok: true, message: xp.awarded ? `Session saved · +${xp.points} XP${xp.returnBonus ? ` (+${xp.returnBonus} welcome back)` : ""}` : "Session saved" };
}

export async function missSessionAction(id: string, reason: string | null) {
  const user = await requireUser();
  const pattern = await missSession(user.id, id, reason?.slice(0, 200) || null, await now(user.id));
  refresh();
  return { pattern: pattern ? pattern.label : null };
}

export async function logStudyAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      title: z.string().trim().min(1, "What did you study?").max(160),
      minutes: z.coerce.number().int().min(5, "At least 5 minutes").max(600),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      topicId: z.string().optional(),
    })
    .safeParse({ ...formToObject(form), topicId: form.get("topicId") || undefined });
  if (!r.success) return fail("Please check the form.", fieldErrorsFrom(r.error));
  try {
    await logStudy(user.id, { title: r.data.title, minutes: r.data.minutes, dateKey: r.data.date, time: r.data.time, topicId: r.data.topicId ?? null }, await now(user.id));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save");
  }
  refresh();
  return { ok: true, message: "Study logged" };
}

export async function resolveObstacleAction(actionId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      reason: z.enum(OBSTACLE_REASONS),
      adjustment: z.enum(["MOVE", "SHORTEN", "KEEP"]),
      moveTo: z.enum(DAY_PARTS.map((p) => p.id) as [string, ...string[]]).optional(),
      note: z.string().trim().max(300).optional(),
    })
    .safeParse({ reason: form.get("reason"), adjustment: form.get("adjustment"), moveTo: form.get("moveTo") || undefined, note: form.get("note") || undefined });
  if (!r.success) return fail("Pick what got in the way and what to change.", fieldErrorsFrom(r.error));
  if (r.data.adjustment === "MOVE" && !r.data.moveTo) return fail("Choose a better time of day", { moveTo: "Required" });
  const res = await resolveObstacle(user.id, actionId, { ...r.data, moveTo: (r.data.moveTo ?? null) as never }, await now(user.id));
  refresh();
  return { ok: true, message: r.data.adjustment === "KEEP" ? "Noted — we'll keep the plan as it is" : `Plan adjusted (${res.changed} sessions changed)` };
}

/* ── Google Calendar sync ─────────────────────────────────────────── */

export async function syncNowAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await syncNow(user.id, await now(user.id));
    refresh();
    return { ok: true, message: r ? `Checked Google: ${r.pulled} change(s) to review, ${r.pushed} new to send` : "Not connected" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Sync failed");
  }
}

export async function applyChangesAction(ids: string[] | "all"): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await applyChanges(user.id, ids, await now(user.id));
    refresh();
    return { ok: true, message: `${r.applied} applied${r.conflicts ? ` · ${r.conflicts} conflict(s) to resolve` : ""}${r.failed ? ` · ${r.failed} failed` : ""}` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't apply changes");
  }
}

export async function rejectChangeAction(id: string) {
  const user = await requireUser();
  await rejectChange(user.id, id, await now(user.id));
  refresh();
}

export async function resolveConflictAction(id: string, keep: "kadam" | "google"): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await resolveConflict(user.id, id, keep, await now(user.id));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't resolve");
  }
  refresh();
  return { ok: true, message: keep === "kadam" ? "Kept your Kadam version" : "Kept the Google version" };
}

export async function updateSyncKindsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const kinds = form.getAll("kinds").map(String).filter((k): k is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(k));
  await updateSyncKinds(user.id, kinds);
  refresh();
  return { ok: true, message: "Saved — new and changed events of these kinds will be offered for Google" };
}

export async function disconnectGoogleAction(deleteGoogleCalendar: boolean) {
  const user = await requireUser();
  await disconnect(user.id, { deleteGoogleCalendar });
  redirect("/calendar/sync?disconnected=1");
}
