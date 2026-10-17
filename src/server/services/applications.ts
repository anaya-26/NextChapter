import "server-only";
import { z } from "zod";
import type { ApplicationStatus, RequirementState } from "@/generated/prisma/client";
import { coverage, deadlineState, isEligibilityRequirement } from "@/lib/opportunity-text";
import { addDaysToKey, daysBetweenKeys, localDateKey } from "@/lib/time";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { createEvent, deleteEvent } from "./calendar";
import { addMilestone, createGoal } from "./goals";
import { getPrivacy, getProfile } from "./profile";
import { preferredStartTime } from "./revision";

/**
 * Application tracking, gap analysis and interview practice. Gap analysis compares an
 * opportunity's published requirements with what the student has actually shown (approved
 * achievements), keeping "studied" separate from "demonstrated" and leaving eligibility facts
 * for the student to confirm. Gaps can become goals and calendar tasks.
 */

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "SAVED", label: "Saved" },
  { value: "PREPARING", label: "Preparing" },
  { value: "APPLIED", label: "Applied" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Not selected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export async function listApplications(userId: string, at: Date) {
  const apps = await prisma.application.findMany({
    where: { userId },
    include: {
      opportunity: true,
      requirements: { select: { state: true } },
      calendarEvents: { where: { status: { not: "CANCELLED" }, startAt: { gte: at } }, orderBy: { startAt: "asc" }, take: 1 },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return apps.map((a) => ({
    ...a,
    deadlineState: a.opportunity.isRecurring ? ("UNKNOWN" as const) : deadlineState(a.opportunity.deadline, at),
    gaps: a.requirements.filter((r) => r.state === "GAP").length,
    met: a.requirements.filter((r) => r.state === "MET").length,
    nextEvent: a.calendarEvents[0] ?? null,
  }));
}

export async function getApplication(userId: string, opportunityId: string) {
  return prisma.application.findFirst({
    where: { userId, opportunityId },
    include: {
      requirements: { include: { goal: { select: { id: true, title: true, status: true } } }, orderBy: { id: "asc" } },
      interviewPractice: { orderBy: { createdAt: "desc" } },
      calendarEvents: { where: { status: { not: "CANCELLED" } }, orderBy: { startAt: "asc" } },
      cv: { select: { id: true, title: true } },
    },
  });
}

export type ApplicationUpdate = {
  status: ApplicationStatus;
  notes: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  cvId: string | null;
};

/** Updates the tracker. A dated next step becomes a calendar reminder (replacing the previous one). */
export async function updateApplication(userId: string, applicationId: string, input: ApplicationUpdate, at: Date) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId }, include: { opportunity: true } });
  if (!app) throw new Error("Application not found");
  if (input.cvId && !(await prisma.cv.findFirst({ where: { id: input.cvId, userId } }))) throw new Error("CV not found");
  const profile = await getProfile(userId);
  const nextStepAt = input.nextStep && input.nextStepDate ? new Date(`${input.nextStepDate}T00:00:00Z`) : null;
  const updated = await prisma.application.update({
    where: { id: app.id },
    data: {
      status: input.status,
      notes: input.notes,
      nextStep: input.nextStep,
      nextStepAt,
      cvId: input.cvId,
      appliedAt: input.status === "APPLIED" && !app.appliedAt ? at : app.appliedAt,
    },
  });
  const changedStep = input.nextStep !== app.nextStep || (nextStepAt?.getTime() ?? null) !== (app.nextStepAt?.getTime() ?? null);
  if (changedStep) {
    const old = await prisma.calendarEvent.findMany({ where: { userId, applicationId: app.id, isDeadline: false, kind: "REMINDER" }, select: { id: true } });
    for (const e of old) await deleteEvent(userId, e.id);
    if (input.nextStep && input.nextStepDate) {
      await createEvent(userId, {
        title: `${app.opportunity.title}: ${input.nextStep}`.slice(0, 160),
        kind: "REMINDER",
        dateKey: input.nextStepDate,
        startTime: preferredStartTime(profile.preferredStudyTimes),
        durationMinutes: 30,
        allDay: false,
        rrule: null,
        reminderMinutes: [60],
        showCountdown: false,
        isDeadline: false,
        applicationId: app.id,
      });
    }
  }
  return updated;
}

// ───────────────────────── gap analysis ─────────────────────────

type Evidence = {
  achievements: { id: string; title: string; text: string; skills: string[] }[];
  studied: { name: string; minutes: number }[];
  claimed: string[];
  education: string[];
};

async function gatherEvidence(userId: string): Promise<Evidence> {
  const [achievements, subjects, profile, education] = await Promise.all([
    prisma.achievement.findMany({ where: { userId, approved: true } }),
    prisma.subject.findMany({ where: { userId }, select: { id: true, name: true } }),
    getProfile(userId),
    prisma.educationRecord.findMany({ where: { userId } }),
  ]);
  const studied: Evidence["studied"] = [];
  for (const s of subjects) {
    const agg = await prisma.studySession.aggregate({ where: { userId, status: { in: ["COMPLETED", "PARTIAL"] }, OR: [{ subjectId: s.id }, { topic: { syllabus: { subjectId: s.id } } }] }, _sum: { actualMinutes: true } });
    const minutes = agg._sum.actualMinutes ?? 0;
    if (minutes >= 30) studied.push({ name: s.name, minutes });
  }
  return {
    achievements: achievements.map((a) => ({ id: a.id, title: a.title, skills: a.skillsDemonstrated, text: [a.title, a.description, a.outcomes ?? "", a.skillsDemonstrated.join(" "), a.subjectsRelated.join(" ")].join(" ") })),
    studied,
    claimed: profile.skills,
    education: [...education.map((e) => `${e.qualification} ${e.institution}`), ...profile.qualificationsDone, ...profile.qualificationsPursuing],
  };
}

export type GapRow = { requirement: string; state: RequirementState; explanation: string; achievementIds: string[] };

/** Transparent rule-based comparison. "Studied" never counts as "shown". */
export function rulesGapAnalysis(requirements: string[], ev: Evidence): GapRow[] {
  return requirements.map((req) => {
    if (isEligibilityRequirement(req)) {
      return { requirement: req, state: "UNKNOWN", explanation: "An eligibility condition — check it yourself against the official page.", achievementIds: [] };
    }
    const shown = ev.achievements.map((a) => ({ a, c: Math.max(coverage(req, a.text), ...a.skills.map((s) => coverage(req, s))) })).filter((x) => x.c >= 0.5).sort((x, y) => y.c - x.c);
    if (shown.length) {
      return { requirement: req, state: "MET", explanation: `Shown in ${shown.slice(0, 2).map((x) => `“${x.a.title}”`).join(" and ")}.`, achievementIds: shown.slice(0, 3).map((x) => x.a.id) };
    }
    const studied = ev.studied.find((s) => Math.max(coverage(req, s.name), coverage(s.name, req)) >= 0.3);
    if (studied) return { requirement: req, state: "GAP", explanation: `You’ve studied ${studied.name} (${Math.round(studied.minutes / 60)} h) but haven’t shown it in a project or achievement yet.`, achievementIds: [] };
    const claimed = ev.claimed.find((s) => coverage(req, s) >= 0.5);
    if (claimed) return { requirement: req, state: "GAP", explanation: `You listed “${claimed}” as a skill. Add an approved achievement with evidence to show it.`, achievementIds: [] };
    return { requirement: req, state: "GAP", explanation: "No evidence yet in your approved achievements.", achievementIds: [] };
  });
}

const gapSchema = z.object({
  rows: z.array(z.object({ requirement: z.string(), state: z.enum(["MET", "GAP", "UNKNOWN"]), explanation: z.string(), achievementIds: z.array(z.string()) })),
});

/** Gap analysis for a saved opportunity. Rows the student decided themselves are kept. */
export async function analyseGaps(userId: string, applicationId: string) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId }, include: { opportunity: true, requirements: true } });
  if (!app) throw new Error("Application not found");
  const requirements = app.opportunity.requirements.length
    ? app.opportunity.requirements
    : (app.opportunity.eligibility ?? "")
        .split(/[.;]\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3)
        .slice(0, 6);
  if (!requirements.length) throw new Error("This opportunity doesn’t list requirements. Add them from the posting first.");
  const ev = await gatherEvidence(userId);
  let rows = rulesGapAnalysis(requirements, ev);
  let by: "AI" | "MOCK" | "RULES" = "RULES";
  const privacy = await getPrivacy(userId);
  const ai = getAiProvider();
  if (ai && privacy.aiUseGoals && privacy.aiUseProfile) {
    try {
      const r = await withAi(userId, "gap_analysis", (p) =>
        p.generateObject({
          feature: "gap_analysis",
          userId,
          system: `${CORE_RULES}\n\n## Task: compare an opportunity's requirements with a student's evidence\nFor each requirement: MET only if an approved achievement clearly demonstrates it (cite its id); GAP if not shown (studying a subject is not the same as demonstrating it — say so); UNKNOWN for eligibility facts the student must confirm (age, marks, enrolment, documents). Be concrete and kind; never overstate a match.`,
          task: `Requirements: ${JSON.stringify(requirements)}. Rule-based draft: ${JSON.stringify(rows)}`,
          references: [
            ...ev.achievements.map((a) => ({ id: a.id, title: `Approved achievement: ${a.title}`, text: a.text })),
            { id: "studied", title: "Subjects studied (time)", text: ev.studied.map((s) => `${s.name}: ${Math.round(s.minutes / 60)} h`).join("; ") || "none" },
            { id: "education", title: "Education", text: ev.education.join("; ") || "not given" },
          ],
          schema: gapSchema,
          effort: "low",
        }),
      );
      const own = new Set(ev.achievements.map((a) => a.id));
      const aiRows = new Map(r.data.rows.map((x) => [x.requirement, x]));
      rows = rows.map((row) => {
        const x = aiRows.get(row.requirement);
        if (!x) return row;
        const ids = x.achievementIds.filter((id) => own.has(id));
        // A "met" claim must point at real evidence; eligibility stays with the student.
        const state = x.state === "MET" && !ids.length ? "GAP" : isEligibilityRequirement(row.requirement) ? "UNKNOWN" : x.state;
        return { requirement: row.requirement, state, explanation: x.explanation.slice(0, 400), achievementIds: ids };
      });
      by = ai.name === "mock" ? "MOCK" : "AI";
    } catch {
      by = "RULES";
    }
  }
  const studentRows = new Set(app.requirements.filter((r) => r.decidedBy === "STUDENT").map((r) => r.requirement));
  await prisma.$transaction(async (tx) => {
    const stale = app.requirements.filter((r) => r.decidedBy !== "STUDENT");
    for (const r of stale) {
      const keep = rows.find((x) => x.requirement === r.requirement);
      if (keep) await tx.requirementCheck.update({ where: { id: r.id }, data: { state: keep.state, explanation: keep.explanation, achievementIds: keep.achievementIds, decidedBy: by } });
      else await tx.requirementCheck.delete({ where: { id: r.id } });
    }
    const existing = new Set(app.requirements.map((r) => r.requirement));
    for (const row of rows) {
      if (existing.has(row.requirement) || studentRows.has(row.requirement)) continue;
      await tx.requirementCheck.create({ data: { userId, applicationId: app.id, requirement: row.requirement, state: row.state, explanation: row.explanation, achievementIds: row.achievementIds, decidedBy: by } });
    }
    if (app.status === "SAVED") await tx.application.update({ where: { id: app.id }, data: { status: "PREPARING" } });
  });
  return { by, rows: await prisma.requirementCheck.findMany({ where: { applicationId: app.id }, orderBy: { id: "asc" } }) };
}

export async function setRequirementState(userId: string, checkId: string, state: RequirementState) {
  const r = await prisma.requirementCheck.updateMany({ where: { id: checkId, userId }, data: { state, decidedBy: "STUDENT", explanation: state === "MET" ? "You marked this as met." : state === "GAP" ? "You marked this as a gap." : "You’ll check this yourself." } });
  if (!r.count) throw new Error("Requirement not found");
}

/** Turns a gap into a goal with milestones and a first work session in the calendar. Idempotent. */
export async function planForGap(userId: string, checkId: string, at: Date) {
  const check = await prisma.requirementCheck.findFirst({ where: { id: checkId, userId }, include: { goal: true, application: { include: { opportunity: true } } } });
  if (!check) throw new Error("Requirement not found");
  if (check.goal) return { goal: check.goal, created: false, dateKey: null as string | null };
  const profile = await getProfile(userId);
  const todayKey = localDateKey(at, profile.timezone);
  const opp = check.application.opportunity;
  const deadlineKey = opp.deadline && opp.deadline > at ? localDateKey(opp.deadline, profile.timezone) : null;
  const target = deadlineKey && deadlineKey > addDaysToKey(todayKey, 7) ? addDaysToKey(deadlineKey, -3) : addDaysToKey(todayKey, 30);
  const goal = await createGoal(
    userId,
    {
      title: `Show “${check.requirement.slice(0, 100)}”`,
      description: `For ${opp.title} (${opp.organisation}). Studying alone doesn’t show it — a small project with evidence does.`,
      whyItMatters: `It’s listed as a requirement for ${opp.title}.`,
      horizon: "SHORT",
      category: "SKILL",
      targetDate: target,
      isCurrentPriority: false,
    },
    "SUGGESTION",
    { requirementId: check.id },
  );
  const steps = [`Learn the basics of ${check.requirement}`, `Use it in a small project`, `Add the project to your portfolio with a link or file as evidence`];
  for (const [i, s] of steps.entries()) await addMilestone(userId, goal.id, s.slice(0, 160), addDaysToKey(todayKey, Math.round(((i + 1) * Math.max(3, daysBetweenKeys(todayKey, target))) / steps.length)));
  const dateKey = addDaysToKey(todayKey, 1);
  await createEvent(userId, {
    title: `Work on: ${check.requirement}`.slice(0, 160),
    kind: "PROJECT",
    dateKey,
    startTime: preferredStartTime(profile.preferredStudyTimes),
    durationMinutes: 60,
    allDay: false,
    rrule: null,
    reminderMinutes: [15],
    showCountdown: false,
    isDeadline: false,
    goalId: goal.id,
    applicationId: check.applicationId,
  });
  return { goal, created: true, dateKey };
}

// ───────────────────────── interview practice ─────────────────────────

/** Practice questions drawn from the opportunity and the student's own achievements. */
export async function interviewQuestions(userId: string, applicationId: string | null) {
  const app = applicationId ? await prisma.application.findFirst({ where: { id: applicationId, userId }, include: { opportunity: true, requirements: true } }) : null;
  const achievements = await prisma.achievement.findMany({ where: { userId, approved: true }, orderBy: { updatedAt: "desc" }, take: 3 });
  const qs: { question: string; achievementId?: string; why: string }[] = [
    { question: "Tell me about yourself.", why: "Almost every interview starts here — keep it to a minute." },
  ];
  if (app) qs.push({ question: `Why do you want this ${app.opportunity.kind === "INTERNSHIP" ? "internship" : "opportunity"} at ${app.opportunity.organisation}?`, why: "Shows you’ve read about them and know what you want to learn." });
  for (const a of achievements) qs.push({ question: `Walk me through “${a.title}”. What was your part, and what would you do differently?`, achievementId: a.id, why: "From your approved portfolio — use the STAR shape: situation, task, action, result." });
  for (const r of (app?.requirements ?? []).filter((x) => x.state === "GAP").slice(0, 2)) qs.push({ question: `This role asks for “${r.requirement}”. How are you building it?`, why: "Honest gaps with a plan are fine — say what you’re doing about it." });
  qs.push({ question: "Tell me about a time you worked in a team and something went wrong.", why: "A common behavioural question." });
  return qs;
}

const feedbackSchema = z.object({
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  star: z.object({ situation: z.boolean(), task: z.boolean(), action: z.boolean(), result: z.boolean() }),
  followUp: z.string().nullable(),
});

export type InterviewFeedback = z.infer<typeof feedbackSchema> & { by: "AI" | "MOCK" | "RULES" };

export function rulesInterviewFeedback(answer: string): InterviewFeedback {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const t = answer.toLowerCase();
  const star = {
    situation: /\b(when|during|in (my|our|the)|at (my|our)|last (year|semester|summer))\b/.test(t),
    task: /\b(had to|needed to|goal|task|responsible|asked to|wanted to)\b/.test(t),
    action: /\b(i (built|wrote|made|led|organised|organized|designed|tested|tried|fixed|learned|learnt|decided|created|used)|i\b.*\b(then|so)\b)/.test(t),
    result: /\b(result|so that|which (led|meant)|outcome|learned|learnt|improved|reduced|increased|finished|won|got)\b|\d/.test(t),
  };
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (words >= 60 && words <= 250) strengths.push("A good length for a spoken answer (about one to two minutes).");
  else if (words < 60) improvements.push("Add a little more detail — aim for about one minute when spoken (roughly 80–200 words).");
  else improvements.push("Trim it — long answers lose the listener. Keep the strongest example.");
  if (/\d/.test(answer)) strengths.push("You used a concrete number, which makes the result believable.");
  else improvements.push("If there’s a real number (people helped, days saved, marks improved), mention it.");
  if (/\bi\b/.test(t)) strengths.push("You spoke about your own part (“I…”), not just the team’s.");
  else improvements.push("Say what you did yourself — use “I”, not only “we”.");
  for (const [k, ok] of Object.entries(star)) if (!ok) improvements.push(`Add the ${k} — ${k === "situation" ? "where and when it happened" : k === "task" ? "what needed doing" : k === "action" ? "the steps you took" : "what changed because of it"}.`);
  return { strengths, improvements: improvements.slice(0, 5), star, followUp: null, by: "RULES" };
}

export async function answerInterview(userId: string, input: { applicationId: string | null; question: string; answer: string; achievementId: string | null }, at: Date) {
  if (input.applicationId && !(await prisma.application.findFirst({ where: { id: input.applicationId, userId } }))) throw new Error("Application not found");
  const achievement = input.achievementId ? await prisma.achievement.findFirst({ where: { id: input.achievementId, userId } }) : null;
  let feedback = rulesInterviewFeedback(input.answer);
  const ai = getAiProvider();
  const privacy = await getPrivacy(userId);
  if (ai) {
    try {
      const r = await withAi(userId, "interview_feedback", (p) =>
        p.generateObject({
          feature: "interview_feedback",
          userId,
          system: `${CORE_RULES}\n\n## Task: interview practice feedback\nGive specific, encouraging feedback on the student's practice answer: 2–3 strengths, 2–4 improvements, whether it covers Situation, Task, Action and Result, and one realistic follow-up question an interviewer might ask. Never suggest claiming experience the student doesn't have; if the answer overstates something compared with their achievement record, say so gently.`,
          task: `Question: ${input.question}`,
          references: [
            { id: "answer", title: "The student's practice answer", text: input.answer.slice(0, 6000) },
            ...(achievement && privacy.aiUseGoals ? [{ id: achievement.id, title: `Their approved achievement: ${achievement.title}`, text: `${achievement.description}\n${achievement.outcomes ?? ""}` }] : []),
          ],
          schema: feedbackSchema,
          effort: "low",
        }),
      );
      feedback = { ...r.data, strengths: r.data.strengths.slice(0, 4), improvements: r.data.improvements.slice(0, 5), by: ai.name === "mock" ? "MOCK" : "AI" };
    } catch {
      // keep the rule-based feedback
    }
  }
  const saved = await prisma.interviewPractice.create({
    data: { userId, applicationId: input.applicationId, achievementId: achievement?.id ?? null, question: input.question.slice(0, 500), answer: input.answer.slice(0, 8000), feedback: JSON.stringify(feedback), feedbackBy: feedback.by, createdAt: at },
  });
  return { practice: saved, feedback };
}

export function parseFeedback(raw: string | null): InterviewFeedback | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InterviewFeedback;
  } catch {
    return null;
  }
}

export async function deletePractice(userId: string, id: string) {
  await prisma.interviewPractice.deleteMany({ where: { id, userId } });
}
