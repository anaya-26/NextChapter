import { z } from "zod";
import { isValidTimezone } from "./time";

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v ? v : null));
const list = (maxItems = 30, maxLen = 80) => z.array(text(maxLen)).max(maxItems).default([]);
const intInRange = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a number from ${min} to ${max}` });
        return z.NEVER;
      }
      return Math.round(n);
    });

export const languageCode = z.enum(["en", "hi", "mr"]);

export const profileBasicsSchema = z.object({
  displayName: optionalText(60),
  ageBand: z.enum(["UNDER_13", "TEEN_13_15", "TEEN_16_17", "ADULT", "UNDISCLOSED"]),
  preferredLanguage: languageCode,
});

export const educationSchema = z.object({
  educationStage: z
    .enum(["SCHOOL", "HIGHER_SECONDARY", "UNDERGRADUATE", "POSTGRADUATE", "DIPLOMA", "COMPETITIVE_EXAM", "OTHER"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  boardOrUniversity: optionalText(120),
  institution: optionalText(160),
  course: optionalText(120),
  yearOrClass: optionalText(40),
  qualificationsDone: list(),
  qualificationsPursuing: list(),
});

export const examsSchema = z.object({
  examTargets: list(),
  subjects: list(20, 80),
});

export const timeSchema = z.object({
  weeklyStudyHoursTarget: intInRange(0, 100),
  preferredStudyTimes: list(5, 20),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone"),
});

export const goalsInterestsSchema = z.object({
  careerClarity: z
    .enum(["CLEAR", "EXPLORING", "UNSURE"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  selectedDomains: list(10),
  interests: list(),
  skills: list(),
  ambitions: optionalText(600),
  firstGoal: optionalText(160),
});

export const companionSchema = z.object({
  companionTone: intInRange(0, 100),
  coachingIntensity: z.enum(["GENTLE", "BALANCED", "FIRM"]),
  reminderFrequency: z.enum(["OFF", "MINIMAL", "NORMAL", "FREQUENT"]),
  explanationLanguage: languageCode,
  examAnswerLanguage: languageCode,
  quietMode: z.coerce.boolean().default(false),
});

export const privacySchema = z.object({
  aiUseProfile: z.boolean(),
  aiUseProgress: z.boolean(),
  aiUseGoals: z.boolean(),
  aiUseCalendar: z.boolean(),
  aiUseJournal: z.boolean(),
  aiInferPatterns: z.boolean(),
  aiMemoryEnabled: z.boolean(),
  communityVisible: z.boolean(),
});

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const commitmentSchema = z
  .object({
    title: text(80).min(1, "Give it a short name"),
    kind: z.enum(["CLASS", "COACHING", "COMMUTE", "WORK", "CHORES", "FAMILY", "HEALTH", "SLEEP", "OTHER"]),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day"),
    startTime: hm,
    endTime: hm,
    location: optionalText(120),
    flexible: z.coerce.boolean().default(false),
  })
  .refine((c) => c.startTime !== c.endTime, { message: "Start and end must differ", path: ["endTime"] });

export const goalSchema = z.object({
  title: text(160).min(3, "Describe the goal in a few words"),
  description: optionalText(1000),
  whyItMatters: optionalText(600),
  horizon: z.enum(["SHORT", "LONG"]),
  category: z.enum(["ACADEMIC", "EXAM", "SKILL", "CAREER", "PROJECT", "PERSONAL", "WELLBEING"]),
  targetDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date"),
  isCurrentPriority: z.coerce.boolean().default(false),
});

export const milestoneSchema = z.object({
  goalId: z.string().min(1),
  title: text(160).min(2),
  dueAt: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const careerInterestSchema = z.object({
  domain: text(80).min(2, "Name the domain"),
  roles: list(10),
  companies: list(15),
  cities: list(10),
  workModes: z.array(z.enum(["REMOTE", "ONSITE", "HYBRID"])).default([]),
  status: z.enum(["SELECTED", "EXPLORING", "DROPPED"]).default("EXPLORING"),
  notes: optionalText(600),
});

export const memorySchema = z.object({
  content: text(400).min(3, "Write a short statement"),
  kind: z.enum(["FACT", "PREFERENCE", "GOAL_CONTEXT", "OBSTACLE", "PATTERN", "STRENGTH", "DIFFICULTY"]),
});
