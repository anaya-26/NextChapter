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

// ───────────────────────── opportunities, portfolio & CV ─────────────────────────

const dateKey = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date");
const monthKey = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}$/.test(v), "Use a valid month");
const oppKind = z.enum(["INTERNSHIP", "PROGRAMME", "COMPETITION", "SCHOLARSHIP", "RESEARCH", "FELLOWSHIP", "HACKATHON", "JOB", "OTHER"]);

export const manualOpportunitySchema = z.object({
  sourceUrl: text(500).url("Paste the full link to the posting (starting with https://)"),
  postingText: optionalText(15000),
  title: optionalText(160),
  organisation: optionalText(160),
  kind: z.union([oppKind, z.literal("")]).transform((v) => (v ? v : null)),
  location: optionalText(120),
  workMode: z.union([z.enum(["REMOTE", "ONSITE", "HYBRID"]), z.literal("")]).transform((v) => (v ? v : null)),
  deadline: dateKey,
  compensation: optionalText(120),
});

export const opportunityEditSchema = z.object({
  title: text(160).min(2),
  organisation: optionalText(160),
  location: optionalText(120),
  compensation: optionalText(120),
  deadline: dateKey,
  requirements: list(15, 140),
});

export const applicationUpdateSchema = z.object({
  status: z.enum(["SAVED", "PREPARING", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"]),
  notes: optionalText(2000),
  nextStep: optionalText(160),
  nextStepDate: dateKey,
  cvId: optionalText(40),
});

export const interviewAnswerSchema = z.object({
  applicationId: optionalText(40),
  achievementId: optionalText(40),
  question: text(500).min(5),
  answer: text(8000).min(20, "Write (or dictate) at least a few sentences"),
});

export const achievementSchema = z.object({
  kind: z.enum(["PROJECT", "COURSEWORK", "CERTIFICATE", "VOLUNTEERING", "COMPETITION", "RESPONSIBILITY", "AWARD", "INTERNSHIP", "RESEARCH", "EXTRACURRICULAR", "OTHER"]),
  title: text(160).min(3, "Give it a short title"),
  organisation: optionalText(160),
  role: optionalText(120),
  startMonth: monthKey,
  endMonth: monthKey,
  description: text(2000).min(10, "Describe what you did in a sentence or two"),
  outcomes: optionalText(1000),
  skills: list(15, 60),
  subjects: list(10, 80),
  evidenceLinks: list(5, 500),
});

const year = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1980 || n > 2100) {
      ctx.addIssue({ code: "custom", message: "Use a 4-digit year" });
      return z.NEVER;
    }
    return n;
  });

export const educationRecordSchema = z.object({
  qualification: text(120).min(2, "e.g. Class 12, B.Tech Computer Science"),
  institution: text(160).min(2, "Name the school or college"),
  board: optionalText(120),
  startYear: year,
  endYear: year,
  current: z.coerce.boolean().default(false),
  result: optionalText(60),
});

export const cvCreateSchema = z.object({
  title: text(120).min(2, "Name this CV, e.g. “General” or “Internships”"),
  targetOpportunityId: optionalText(40),
});

export const cvDetailsSchema = z.object({
  title: text(120).min(2),
  headline: optionalText(160),
  summary: optionalText(800),
  contactLine: optionalText(200),
  achievementIds: z.array(z.string()).max(40).default([]),
  educationIds: z.array(z.string()).max(10).default([]),
  skills: list(30, 60),
});

// ───────────────────────── community ─────────────────────────

export const communityJoinSchema = z.object({
  handle: text(20).min(3, "Choose a handle"),
  bio: optionalText(280),
  agree: z.literal("on", { message: "Please agree to the community guidelines" }),
});

export const communityProfileSchema = z.object({ handle: text(20).min(3), bio: optionalText(280) });

export const groupCreateSchema = z.object({
  name: text(80).min(3, "Name the group"),
  description: text(400).min(10, "Say what the group is for"),
  kind: z.enum(["SUBJECT", "COURSE", "EXAM", "PROJECT", "CAREER", "GENERAL"]),
});

export const postSchema = z.object({
  groupId: z.string().min(1, "Choose a group"),
  kind: z.enum(["QUESTION", "RESOURCE", "EXPLANATION", "GOAL", "ACHIEVEMENT", "SHOWCASE", "DISCUSSION"]),
  title: text(160).min(4, "Add a short title"),
  body: text(8000).min(4, "Write a little more"),
  resourceUrl: optionalText(500),
  attribution: optionalText(200),
  sharedFromType: z
    .union([z.enum(["achievement", "goal", "resource", "note"]), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  sharedFromId: optionalText(40),
});

export const commentSchema = z.object({
  body: text(6000).min(2, "Write your reply"),
  isExplanation: z.coerce.boolean().default(false),
  attribution: optionalText(200),
});

export const reportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT", "USER", "RESOURCE"]),
  targetId: z.string().min(1),
  reason: z.enum(["SPAM", "HARASSMENT", "INCORRECT", "INAPPROPRIATE", "SELF_HARM", "PRIVACY", "OTHER"]),
  details: optionalText(500),
});

export const roomSchema = z.object({
  title: text(80).min(3, "Name the room"),
  when: z.enum(["now", "later"]),
  date: z.string().optional(),
  time: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(180),
  groupId: optionalText(40),
});

export const buddyMessageSchema = z.object({ message: optionalText(280) });
