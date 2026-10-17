import "server-only";
import { z } from "zod";
import { parseScheduleText, type ScheduleDraft } from "@/lib/nl-schedule";
import { localDateKey } from "@/lib/time";
import { CORE_RULES } from "../ai/prompts";
import { describeAiError, getAiProvider, withAi } from "../ai";
import { getProfile } from "./profile";
import { eventTimes, findConflicts } from "./calendar";

const KINDS = ["CLASS", "ASSIGNMENT", "EXAM", "REVISION", "STUDY", "PROJECT", "FOCUS", "APPLICATION", "PERSONAL", "REMINDER"] as const;

export const draftSchema = z.object({
  title: z.string(),
  kind: z.enum(KINDS),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  durationMinutes: z.number().int(),
  allDay: z.boolean(),
  recurrence: z.object({ freq: z.enum(["DAILY", "WEEKLY"]), days: z.array(z.number().int().min(0).max(6)), untilKey: z.string().nullable() }).nullable(),
  isDeadline: z.boolean(),
  showCountdown: z.boolean(),
  reminderMinutes: z.array(z.number().int()),
  assumptions: z.array(z.string()),
});

export type DraftMethod = "AI" | "MOCK" | "RULES";

/** Reads a sentence into a draft event (AI when configured, else rules) and checks it for clashes. */
export async function draftFromText(userId: string, text: string, at: Date) {
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  let draft: ScheduleDraft | null = null;
  let method: DraftMethod = "RULES";
  let aiNote: string | null = null;
  const ai = getAiProvider();
  if (ai) {
    try {
      const weekday = new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(at);
      const r = await withAi(userId, "nl_schedule", (p) =>
        p.generateObject({
          feature: "nl_schedule",
          userId,
          system: `${CORE_RULES}\n\n## Task: turn a student's sentence into one calendar entry\nDates in India are usually written day first (23/10 = 23 October). Use the student's local time. Classes and coaching that repeat use a WEEKLY recurrence. Assignments and applications are deadlines (isDeadline=true, 23:59 if no time). Exams and deadlines get a countdown. Never invent details: put every guess in "assumptions" in plain words.`,
          task: `Reference: ${at.toISOString()}\nTimezone: ${tz}\nToday is ${weekday}, ${localDateKey(at, tz)}.\nStudent's sentence: ${text.slice(0, 400)}`,
          schema: draftSchema,
          effort: "low",
        }),
      );
      draft = r.data;
      method = ai.name === "mock" ? "MOCK" : "AI";
    } catch (e) {
      aiNote = describeAiError(e);
    }
  }
  if (!draft) draft = parseScheduleText(text, at, tz);
  if (!draft) return null;
  if (aiNote) draft.assumptions.push(`AI unavailable (${aiNote}) — read with simple rules.`);
  const times = eventTimes({ dateKey: draft.dateKey, startTime: draft.startTime, durationMinutes: draft.durationMinutes, allDay: draft.allDay }, tz);
  const conflicts = draft.isDeadline || draft.allDay ? [] : await findConflicts(userId, times.startAt, times.endAt);
  return { draft, method, conflicts: conflicts.map((c) => ({ title: c.title, start: c.start.toISOString(), end: c.end.toISOString(), kind: c.kind })) };
}
