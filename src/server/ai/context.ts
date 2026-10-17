import "server-only";
import { prisma } from "../db";
import { now } from "../clock";
import { getPrivacy, getProfile } from "../services/profile";
import { memoriesForAi } from "../services/memory";
import { formatInTz, localDateKey, addDaysToKey, dateOnly } from "@/lib/time";
import type { ReferenceDoc } from "./types";

export type ContextPart = "profile" | "goals" | "progress" | "calendar" | "memory" | "journal";

export type StudentContext = {
  /** Compact facts for the model (placed in the user turn, not the system prompt). */
  text: string;
  /** The student's own journal entries they allowed the AI to read (passed as reference data). */
  journal: ReferenceDoc[];
  /** Human-readable list of what was used — shown to the student. */
  used: string[];
  tone: number;
  intensity: string;
  explanationLanguage: string;
  examAnswerLanguage: string;
  timezone: string;
  isMinor: boolean;
};

const STAGE: Record<string, string> = {
  SCHOOL: "school",
  HIGHER_SECONDARY: "higher secondary (Class 11–12)",
  UNDERGRADUATE: "undergraduate",
  POSTGRADUATE: "postgraduate",
  DIPLOMA: "diploma",
  COMPETITIVE_EXAM: "competitive-exam preparation",
  OTHER: "other",
};

/**
 * Builds the personal context for an AI request, including only the categories the
 * student has permitted (PrivacySettings) and only journal entries individually shared.
 */
export async function buildStudentContext(userId: string, want: ContextPart[]): Promise<StudentContext> {
  const [profile, privacy] = await Promise.all([getProfile(userId), getPrivacy(userId)]);
  const at = await now(userId);
  const tz = profile.timezone;
  const lines: string[] = [];
  const used: string[] = [];
  let journal: ReferenceDoc[] = [];

  lines.push(`Current local time for the student: ${formatInTz(at, tz, { dateStyle: "full", timeStyle: "short" })} (${tz}).`);

  if (want.includes("profile") && privacy.aiUseProfile) {
    const bits = [
      profile.educationStage ? `stage: ${STAGE[profile.educationStage]}` : null,
      profile.course ? `course: ${profile.course}` : null,
      profile.yearOrClass ? `year/class: ${profile.yearOrClass}` : null,
      profile.boardOrUniversity ? `board/university: ${profile.boardOrUniversity}` : null,
      profile.examTargets.length ? `exam targets: ${profile.examTargets.join(", ")}` : null,
      profile.weeklyStudyHoursTarget != null ? `weekly study target: ${profile.weeklyStudyHoursTarget} h` : null,
      profile.preferredStudyTimes.length ? `prefers studying: ${profile.preferredStudyTimes.join(", ").toLowerCase()}` : null,
      profile.careerClarity ? `career direction: ${profile.careerClarity.toLowerCase()}` : null,
      profile.selectedDomains.length ? `chosen domains: ${profile.selectedDomains.join(", ")}` : null,
      profile.interests.length ? `interests: ${profile.interests.join(", ")}` : null,
      profile.skills.length ? `skills (self-reported): ${profile.skills.join(", ")}` : null,
      profile.ambitions ? `ambitions (in their words): ${profile.ambitions}` : null,
    ].filter(Boolean);
    if (bits.length) {
      lines.push(`Profile — ${bits.join("; ")}.`);
      used.push("your profile");
    }
  }

  if (want.includes("goals") && privacy.aiUseGoals) {
    const goals = await prisma.goal.findMany({
      where: { userId, status: "ACTIVE" },
      include: { milestones: { where: { completedAt: null }, orderBy: { dueAt: "asc" }, take: 3 } },
      orderBy: [{ isCurrentPriority: "desc" }, { targetDate: "asc" }],
      take: 6,
    });
    if (goals.length) {
      lines.push(
        "Active goals — " +
          goals
            .map(
              (g) =>
                `${g.isCurrentPriority ? "[CURRENT PRIORITY] " : ""}${g.title} (${g.horizon === "SHORT" ? "short-term" : "long-term"}${
                  g.targetDate ? `, target ${g.targetDate.toISOString().slice(0, 10)}` : ""
                })${g.milestones.length ? `; next milestones: ${g.milestones.map((m) => m.title).join(" / ")}` : ""}`,
            )
            .join(" | "),
      );
      used.push("your goals");
    }
  }

  if (want.includes("progress") && privacy.aiUseProgress) {
    const since = new Date(at.getTime() - 14 * 86400000);
    const [topics, attempts, dueRevisions, mistakes] = await Promise.all([
      prisma.topic.groupBy({ by: ["status"], where: { userId, syllabus: { status: "CONFIRMED" } }, _count: true }),
      prisma.practiceAttempt.findMany({
        where: { userId, attemptedAt: { gte: since } },
        select: { isCorrect: true, score: true, topic: { select: { title: true } } },
      }),
      prisma.revisionTask.count({ where: { userId, status: "SCHEDULED", dueAt: { lte: at } } }),
      prisma.mistake.findMany({ where: { userId, status: { not: "RESOLVED" } }, select: { title: true }, take: 5 }),
    ]);
    const parts: string[] = [];
    if (topics.length) parts.push(`roadmap topics by status: ${topics.map((t) => `${t._count} ${t.status.toLowerCase().replace("_", " ")}`).join(", ")}`);
    if (attempts.length) {
      const byTopic = new Map<string, { n: number; score: number }>();
      for (const a of attempts) {
        const key = a.topic.title;
        const cur = byTopic.get(key) ?? { n: 0, score: 0 };
        cur.n++;
        cur.score += a.score ?? (a.isCorrect ? 1 : 0);
        byTopic.set(key, cur);
      }
      parts.push(
        `practice in the last 14 days: ${[...byTopic.entries()]
          .slice(0, 8)
          .map(([t, v]) => `${t} ${Math.round((v.score / v.n) * 100)}% over ${v.n}`)
          .join("; ")}`,
      );
    }
    if (dueRevisions) parts.push(`${dueRevisions} revision task(s) due`);
    if (mistakes.length) parts.push(`open mistakes: ${mistakes.map((m) => m.title).join(" / ")}`);
    if (parts.length) {
      lines.push(`Progress — ${parts.join(". ")}.`);
      used.push("your progress");
    }
  }

  if (want.includes("calendar") && privacy.aiUseCalendar) {
    const end = new Date(at.getTime() + 7 * 86400000);
    const [events, commitments] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { userId, status: { not: "CANCELLED" }, startAt: { gte: at, lte: end } },
        orderBy: { startAt: "asc" },
        take: 15,
        select: { title: true, kind: true, startAt: true, isDeadline: true },
      }),
      prisma.commitment.findMany({ where: { userId, active: true }, take: 10 }),
    ]);
    const parts: string[] = [];
    if (events.length)
      parts.push(
        `next 7 days: ${events
          .map((e) => `${formatInTz(e.startAt, tz, { weekday: "short", hour: "2-digit", minute: "2-digit" })} ${e.title} (${e.kind.toLowerCase()}${e.isDeadline ? ", deadline" : ""})`)
          .join("; ")}`,
      );
    if (commitments.length) parts.push(`regular commitments: ${commitments.map((c) => `${c.title} ${c.startTime}–${c.endTime}`).join("; ")}`);
    if (parts.length) {
      lines.push(`Calendar — ${parts.join(". ")}.`);
      used.push("your calendar");
    }
  }

  if (want.includes("memory")) {
    const memories = await memoriesForAi(userId);
    if (memories.length) {
      lines.push(
        "Things the student has told NextChapter or confirmed (TENTATIVE items are unconfirmed guesses — treat them as possibilities, not facts):\n" +
          memories.map((m) => `- [${m.certainty}] ${m.content}`).join("\n"),
      );
      used.push(`remembered notes (${memories.length})`);
      await prisma.memoryItem.updateMany({ where: { id: { in: memories.map((m) => m.id) } }, data: { lastUsedAt: at } });
    }
  }

  if (want.includes("journal") && privacy.aiUseJournal) {
    const todayKey = localDateKey(at, tz);
    const entries = await prisma.journalEntry.findMany({
      where: { userId, aiAccess: true, date: { gte: dateOnly(addDaysToKey(todayKey, -14)) } },
      orderBy: { date: "desc" },
      take: 10,
    });
    journal = entries.map((e) => ({
      id: `journal-${e.id}`,
      title: `Journal ${e.date.toISOString().slice(0, 10)}${e.title ? ` — ${e.title}` : ""}`,
      text: [
        e.text,
        e.plannedSummary ? `Planned: ${e.plannedSummary}` : null,
        e.actualSummary ? `Actually did: ${e.actualSummary}` : null,
        e.difficulties ? `Difficulties: ${e.difficulties}` : null,
        e.achievements ? `Achievements: ${e.achievements}` : null,
        e.energy ? `Energy (1–5): ${e.energy}` : null,
        e.voiceTranscript ? `Voice note: ${e.voiceTranscript}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    }));
    if (journal.length) used.push(`journal entries you shared (${journal.length})`);
  }

  return {
    text: lines.join("\n"),
    journal,
    used,
    tone: profile.companionTone,
    intensity: profile.coachingIntensity,
    explanationLanguage: profile.explanationLanguage,
    examAnswerLanguage: profile.examAnswerLanguage,
    timezone: tz,
    isMinor: ["UNDER_13", "TEEN_13_15", "TEEN_16_17"].includes(profile.ageBand),
  };
}

/** Describes the coaching voice requested by the student. */
export function toneInstructions(tone: number, intensity: string) {
  const voice =
    tone < 34
      ? "a warm, friendly study buddy: casual, encouraging, uses 'we', celebrates small wins"
      : tone < 67
        ? "a supportive coach: encouraging but clear about what needs to happen next"
        : "a firm, respectful mentor: direct and concise, holds the student to their own commitments, never harsh or shaming";
  const push =
    intensity === "GENTLE"
      ? "Suggest at most one next step and keep pressure low."
      : intensity === "FIRM"
        ? "Be specific about deadlines and trade-offs, and ask for a concrete commitment."
        : "Offer one or two practical next steps.";
  return `Coaching voice: ${voice}. ${push}`;
}
