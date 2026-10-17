import "server-only";
import { z } from "zod";
import type { ExplorationKind, Prisma } from "@/generated/prisma/client";
import { DOMAIN_PATHS, domainsForSubject, pathFor, type ExplorationKindName } from "@/lib/domain-paths";
import { addDaysToKey, dateOnly, localDateKey } from "@/lib/time";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { getPrivacy, getProfile } from "./profile";
import { awardXp } from "./xp";
import { createGoal, addMilestone } from "./goals";

/**
 * Career discovery for students who are still exploring. After about three months of real
 * engagement (missed days never reset anything) Kadam offers a discovery review: several
 * possibilities, each tied to evidence and honest about uncertainty, with small exploration
 * projects. A preliminary review is available earlier and says plainly how little it is based on.
 */

export const DISCOVERY_SPAN_DAYS = 84;
export const DISCOVERY_ACTIVE_DAYS = 30;
export const PRELIMINARY_MIN_ACTIVE_DAYS = 3;

export async function engagement(userId: string, at: Date) {
  const profile = await getProfile(userId);
  const todayKey = localDateKey(at, profile.timezone);
  const days = await prisma.xpEvent.findMany({ where: { userId, occurredOn: { lte: dateOnly(todayKey) } }, distinct: ["occurredOn"], select: { occurredOn: true, isDemo: true }, orderBy: { occurredOn: "asc" } });
  const first = days[0]?.occurredOn ?? null;
  const spanDays = first ? Math.floor((dateOnly(todayKey).getTime() - first.getTime()) / 86400000) : 0;
  const activeDays = days.length;
  const demoDays = days.filter((d) => d.isDemo).length;
  return { spanDays, activeDays, demoDays, eligible: spanDays >= DISCOVERY_SPAN_DAYS && activeDays >= DISCOVERY_ACTIVE_DAYS, canPreview: activeDays >= PRELIMINARY_MIN_ACTIVE_DAYS };
}

export type Evidence = {
  stage: string | null;
  subjects: { name: string; minutes: number; topicsStudied: number; understandingChecks: number; accuracy: number | null; attempts: number }[];
  interests: string[];
  skills: string[];
  ambitions: string | null;
  domains: { domain: string; status: string; notes: string | null }[];
  explorations: { title: string; domain: string | null; reflection: string | null }[];
  achievements: { title: string; skills: string[] }[];
  journalHighlights: string[];
  used: string[];
  notUsed: string[];
};

/** Collects evidence from only the categories the student permits. */
export async function gatherEvidence(userId: string, at: Date): Promise<Evidence> {
  const [profile, privacy] = await Promise.all([getProfile(userId), getPrivacy(userId)]);
  const used: string[] = [];
  const notUsed: string[] = [];
  const ev: Evidence = { stage: profile.educationStage, subjects: [], interests: [], skills: [], ambitions: null, domains: [], explorations: [], achievements: [], journalHighlights: [], used, notUsed };

  if (privacy.aiUseProfile) {
    ev.interests = profile.interests;
    ev.skills = profile.skills;
    ev.ambitions = profile.ambitions;
    used.push("your profile (interests, skills, ambitions)");
  } else notUsed.push("profile (turned off in Privacy)");

  if (privacy.aiUseProgress) {
    const subjects = await prisma.subject.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, name: true } });
    for (const s of subjects) {
      const [sessions, topics, attempts] = await Promise.all([
        prisma.studySession.findMany({ where: { userId, status: { in: ["COMPLETED", "PARTIAL"] }, OR: [{ subjectId: s.id }, { topic: { syllabus: { subjectId: s.id } } }] }, select: { actualMinutes: true } }),
        prisma.topic.findMany({ where: { userId, syllabus: { subjectId: s.id } }, select: { studiedAt: true, status: true, understandingCheckedAt: true } }),
        prisma.practiceAttempt.findMany({ where: { userId, score: { not: null }, topic: { syllabus: { subjectId: s.id } } }, select: { score: true } }),
      ]);
      ev.subjects.push({
        name: s.name,
        minutes: sessions.reduce((a, x) => a + (x.actualMinutes ?? 0), 0),
        topicsStudied: topics.filter((t) => t.studiedAt || t.status === "STUDIED").length,
        understandingChecks: topics.filter((t) => t.understandingCheckedAt).length,
        accuracy: attempts.length ? attempts.reduce((a, x) => a + x.score!, 0) / attempts.length : null,
        attempts: attempts.length,
      });
    }
    used.push("your study history and practice results");
  } else notUsed.push("study progress (turned off in Privacy)");

  if (privacy.aiUseGoals) {
    const [interests, explorations, achievements] = await Promise.all([
      prisma.careerInterest.findMany({ where: { userId, status: { not: "DROPPED" } } }),
      prisma.explorationProject.findMany({ where: { userId, status: "COMPLETED" }, select: { title: true, domain: true, reflection: true } }),
      prisma.achievement.findMany({ where: { userId, approved: true }, select: { title: true, skillsDemonstrated: true } }),
    ]);
    ev.domains = interests.map((i) => ({ domain: i.domain, status: i.status, notes: i.notes }));
    ev.explorations = explorations;
    ev.achievements = achievements.map((a) => ({ title: a.title, skills: a.skillsDemonstrated }));
    used.push("your career interests, explorations and approved achievements");
  } else notUsed.push("goals and career interests (turned off in Privacy)");

  if (privacy.aiUseJournal) {
    const entries = await prisma.journalEntry.findMany({
      where: { userId, aiAccess: true, achievements: { not: null }, date: { gte: dateOnly(addDaysToKey(localDateKey(at, profile.timezone), -120)) } },
      orderBy: { date: "desc" },
      take: 12,
      select: { achievements: true, text: true },
    });
    ev.journalHighlights = entries.map((e) => (e.achievements ?? "").slice(0, 200)).filter(Boolean);
    if (ev.journalHighlights.length) used.push(`what went well in ${ev.journalHighlights.length} journal entries you shared`);
  } else notUsed.push("journal (not shared)");
  return ev;
}

export type Possibility = {
  title: string;
  whyItFits: string;
  evidence: string[];
  uncertainties: string[];
  nextStep: string;
  explorationProject: { title: string; kind: ExplorationKindName; steps: string[] };
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SCHOOL_STAGES = ["SCHOOL", "HIGHER_SECONDARY"];

type Signal = "SUBJECT" | "CHOSEN" | "CURIOUS" | "INTEREST" | "EXPLORATION" | "JOURNAL" | "ACHIEVEMENT";

const SIGNAL_WORDS: Record<Exclude<Signal, "SUBJECT">, string> = {
  CHOSEN: "you chose it as a direction",
  CURIOUS: "you said you’re curious about it",
  INTEREST: "an interest you listed",
  EXPLORATION: "an exploration you completed",
  JOURNAL: "what you wrote went well in your journal",
  ACHIEVEMENT: "an achievement you approved",
};

function joinList(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const studyTime = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`);

/** Evidence-weighted possibilities without AI (transparent scoring). Too little activity in a subject isn’t treated as evidence. */
export function rulesPossibilities(ev: Evidence): Possibility[] {
  const scores = new Map<string, { score: number; evidence: string[]; signals: Set<Signal>; subjects: string[] }>();
  const add = (domain: string, points: number, signal: Signal, why: string, subject?: string) => {
    const cur = scores.get(domain) ?? { score: 0, evidence: [], signals: new Set<Signal>(), subjects: [] };
    cur.score += points;
    cur.signals.add(signal);
    if (subject && !cur.subjects.includes(subject)) cur.subjects.push(subject);
    if (!cur.evidence.includes(why)) cur.evidence.push(why);
    scores.set(domain, cur);
  };
  for (const d of ev.domains) {
    const path = pathFor(d.domain);
    if (path) add(path.domain, d.status === "SELECTED" ? 3 : 2, d.status === "SELECTED" ? "CHOSEN" : "CURIOUS", d.status === "SELECTED" ? `You chose ${d.domain} as a direction.` : `You’re curious about ${d.domain}.`);
  }
  for (const s of [...ev.subjects].sort((a, b) => b.minutes - a.minutes)) {
    if (s.minutes < 30 && s.attempts < 5) continue;
    const strong = s.accuracy != null && s.attempts >= 5 && s.accuracy >= 0.7;
    const time = s.minutes >= 300;
    for (const domain of domainsForSubject(s.name)) {
      add(domain, 1 + (strong ? 1 : 0) + (time ? 1 : 0), "SUBJECT", `${s.name}: ${studyTime(s.minutes)} studied${s.accuracy != null && s.attempts >= 5 ? `, ${pct(s.accuracy)} practice accuracy over ${s.attempts} questions` : ""}.`, s.name);
    }
  }
  for (const interest of ev.interests) {
    const i = interest.toLowerCase();
    for (const p of DOMAIN_PATHS) {
      if (p.domain.toLowerCase().split(/[ ,&()]+/).some((w) => w.length > 3 && i.includes(w)) || p.subjects.some((k) => i.includes(k))) add(p.domain, 1, "INTEREST", `You listed “${interest}” as an interest.`);
    }
  }
  for (const e of ev.explorations) {
    const p = e.domain ? pathFor(e.domain) : null;
    if (p) add(p.domain, 2, "EXPLORATION", `You completed “${e.title}”${e.reflection ? ` and reflected: “${e.reflection.slice(0, 80)}”` : ""}.`);
  }
  for (const a of ev.achievements) {
    const skills = a.skills.map((x) => x.toLowerCase());
    for (const p of DOMAIN_PATHS) {
      if (skills.some((k) => k.length > 2 && p.skills.some((ps) => ps.toLowerCase().includes(k)))) add(p.domain, 2, "ACHIEVEMENT", `You showed ${joinList(a.skills.slice(0, 3))} in “${a.title}”.`);
    }
  }
  for (const h of ev.journalHighlights) {
    const t = h.toLowerCase();
    for (const p of DOMAIN_PATHS) if (p.subjects.some((k) => t.includes(k))) add(p.domain, 1, "JOURNAL", `In your journal: “${h.slice(0, 90)}”.`);
  }
  const school = SCHOOL_STAGES.includes(ev.stage ?? "");
  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 4)
    .map(([domain, s]) => {
      const path = pathFor(domain)!;
      const parts = [
        ...(s.subjects.length ? [`your time on ${joinList(s.subjects.slice(0, 3))}`] : []),
        ...(Object.keys(SIGNAL_WORDS) as (keyof typeof SIGNAL_WORDS)[]).filter((k) => s.signals.has(k)).map((k) => SIGNAL_WORDS[k]),
      ];
      const uncertainties: string[] = [];
      if (!s.signals.has("EXPLORATION")) uncertainties.push("You haven’t tried hands-on work in this area yet.");
      if (s.signals.size === 1 && s.signals.has("SUBJECT")) uncertainties.push("This rests on school subjects alone — doing well in a subject shows aptitude, not necessarily that you’d enjoy the work every day.");
      else if (!s.signals.has("SUBJECT") && !s.signals.has("ACHIEVEMENT")) uncertainties.push("Interest alone doesn’t yet show how the day-to-day work suits you.");
      if (s.evidence.length === 1) uncertainties.push("Only one signal points here so far.");
      return {
        title: domain,
        whyItFits: `What points here: ${joinList(parts)}.`,
        evidence: s.evidence.slice(0, 4),
        uncertainties,
        nextStep: school ? `Find out about: ${path.entryRoutes[0]}` : `Roles to look at: ${path.roles.slice(0, 2).join(", ")}`,
        explorationProject: path.exploration,
      };
    });
}

const reviewSchema = z.object({
  summary: z.string(),
  possibilities: z.array(
    z.object({
      title: z.string(),
      whyItFits: z.string(),
      evidence: z.array(z.string()),
      uncertainties: z.array(z.string()),
      nextStep: z.string(),
      explorationProject: z.object({ title: z.string(), kind: z.enum(["MINI_PROJECT", "SIMULATION", "INFORMATIONAL_INTERVIEW", "READING", "SHADOWING", "COURSE"]), steps: z.array(z.string()) }),
    }),
  ),
  limitations: z.array(z.string()),
});

export async function generateCareerReview(userId: string, at: Date) {
  const eng = await engagement(userId, at);
  if (!eng.canPreview) throw new Error(`A review needs at least ${PRELIMINARY_MIN_ACTIVE_DAYS} active days so there’s something to base it on.`);
  const kind = eng.eligible ? "DISCOVERY" : "PRELIMINARY";
  const ev = await gatherEvidence(userId, at);
  const rules = rulesPossibilities(ev);
  const limitations = [
    kind === "PRELIMINARY"
      ? `Preliminary: based on ${eng.activeDays} active days over ${eng.spanDays} days. A fuller discovery review becomes available after about three months with ${DISCOVERY_ACTIVE_DAYS} active days.`
      : `Based on ${eng.activeDays} active days over ${eng.spanDays} days — what you enjoy can change, so treat this as a snapshot.`,
    ...ev.notUsed.map((n) => `Not used: ${n}.`),
    ...(eng.demoDays ? [`${eng.demoDays} of the active days are labelled demonstration data.`] : []),
    ...(rules.length < 3 ? ["There isn’t enough evidence yet for more than a few suggestions — try an exploration project to learn more."] : []),
  ];
  const ai = getAiProvider();
  let summary = kind === "DISCOVERY" ? "Here are a few directions your last few months point towards. None of them is a verdict — they’re worth exploring." : "Early signals only — use these to choose something small to try, not to decide anything.";
  let possibilities = rules;
  let generatedBy: "AI" | "MOCK" | "RULES" = "RULES";
  let model: string | null = null;
  if (ai) {
    const r = await withAi(userId, "career_review", (p) =>
      p.generateObject({
        feature: "career_review",
        userId,
        system: `${CORE_RULES}\n\n## Task: a career discovery review for a student in India\nOffer 3–4 different possibilities, never a single answer and never a ranking by prestige or salary. Tie every possibility to specific evidence from the data, list real uncertainties, and suggest one small exploration project each (a mini project, informational interview, reading, short course or a simulation — call simulations learning activities, not real work experience). Adapt to the education stage: for school students talk about broad fields, streams and courses; for college students, roles, skills and internships. Avoid stereotypes based on gender, caste, religion, region or family background. ${kind === "PRELIMINARY" ? "This is a PRELIMINARY review with limited evidence: say so and keep claims modest." : ""}`,
        task: `Review type: ${kind}. Engagement: ${eng.activeDays} active days over ${eng.spanDays} days. Evidence (computed by the app from permitted data): ${JSON.stringify({ ...ev, used: undefined, notUsed: undefined })}. Rule-based draft: ${JSON.stringify(rules)}`,
        references: ev.journalHighlights.map((h, i) => ({ id: `journal-${i}`, title: "What went well (journal)", text: h })),
        schema: reviewSchema,
        effort: "medium",
      }),
    );
    if (r.data.possibilities.length >= 2) {
      summary = r.data.summary;
      possibilities = r.data.possibilities.slice(0, 4);
      limitations.push(...r.data.limitations.slice(0, 3));
      generatedBy = ai.name === "mock" ? "MOCK" : "AI";
      model = r.model;
    }
  }
  return prisma.careerReview.create({
    data: {
      userId,
      kind,
      engagementDays: eng.activeDays,
      spanDays: eng.spanDays,
      evidence: { ...ev, summary } as unknown as Prisma.InputJsonValue,
      suggestions: possibilities as unknown as Prisma.InputJsonValue,
      limitations,
      generatedBy,
      model,
      createdAt: at,
    },
  });
}

export async function latestReview(userId: string) {
  return prisma.careerReview.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function reviewFeedback(userId: string, reviewId: string, feedback: string) {
  const res = await prisma.careerReview.updateMany({ where: { id: reviewId, userId }, data: { studentFeedback: feedback.slice(0, 2000) } });
  return res.count === 1;
}

/* ── Exploration projects ─────────────────────────────────────────── */

export async function startExploration(userId: string, input: { reviewId?: string; index?: number; domain?: string }) {
  let p: { title: string; whyItFits?: string; explorationProject: { title: string; kind: ExplorationKindName; steps: string[] } } | null = null;
  let reviewId: string | null = null;
  if (input.reviewId != null && input.index != null) {
    const review = await prisma.careerReview.findFirst({ where: { id: input.reviewId, userId } });
    if (!review) throw new Error("Review not found");
    p = (review.suggestions as unknown as Possibility[])[input.index] ?? null;
    reviewId = review.id;
  } else if (input.domain) {
    const path = pathFor(input.domain);
    if (path) p = { title: path.domain, explorationProject: path.exploration };
  }
  if (!p) throw new Error("Nothing to explore");
  const existing = await prisma.explorationProject.findFirst({ where: { userId, title: p.explorationProject.title, status: { in: ["PROPOSED", "ACTIVE"] } } });
  if (existing) return existing;
  return prisma.explorationProject.create({
    data: {
      userId,
      careerReviewId: reviewId,
      title: p.explorationProject.title,
      description: p.whyItFits ?? `A first look at ${p.title}.`,
      domain: p.title,
      kind: p.explorationProject.kind as ExplorationKind,
      steps: p.explorationProject.steps.slice(0, 8),
      status: "ACTIVE",
    },
  });
}

export async function completeExploration(userId: string, id: string, input: { reflection: string; interest: "MORE" | "SAME" | "LESS" }, at: Date) {
  const e = await prisma.explorationProject.findFirst({ where: { id, userId, status: { in: ["PROPOSED", "ACTIVE"] } } });
  if (!e) throw new Error("Exploration not found");
  await prisma.explorationProject.update({ where: { id }, data: { status: "COMPLETED", reflection: `${input.reflection.slice(0, 1500)}${input.interest === "MORE" ? " (want to explore more)" : input.interest === "LESS" ? " (less interested now)" : ""}` } });
  if (e.domain && input.interest !== "LESS") {
    const existing = await prisma.careerInterest.findFirst({ where: { userId, domain: e.domain } });
    if (!existing && input.interest === "MORE") await prisma.careerInterest.create({ data: { userId, domain: e.domain, status: "EXPLORING", notes: `After “${e.title}”` } });
  }
  return awardXp(userId, { action: "PROJECT_PROGRESS", dedupeKey: `exploration:${id}`, reason: `Finished exploring: ${e.title}`, sourceType: "ExplorationProject", sourceId: id, at });
}

export async function dropExploration(userId: string, id: string) {
  const res = await prisma.explorationProject.updateMany({ where: { id, userId, status: { in: ["PROPOSED", "ACTIVE"] } }, data: { status: "DROPPED" } });
  return res.count === 1;
}

/* ── Domain plans for students who know their direction ───────────── */

export function domainPlan(domain: string) {
  return pathFor(domain);
}

/** Turns a domain's starting points into a long-term goal with milestones (after the student agrees). */
export async function createDomainGoal(userId: string, domain: string) {
  const path = pathFor(domain);
  if (!path) throw new Error("No starting points for that domain yet");
  const title = `Build towards ${path.domain}`;
  const existing = await prisma.goal.findFirst({ where: { userId, title, status: "ACTIVE" } });
  if (existing) return existing;
  const goal = await createGoal(
    userId,
    { title, description: `Starting points: ${path.roles.slice(0, 3).join(", ")}.`, whyItMatters: null, horizon: "LONG", category: "CAREER", targetDate: null, isCurrentPriority: false },
    "SUGGESTION",
  );
  for (const m of [...path.skills.slice(0, 3).map((s) => `Learn: ${s}`), `Build: ${path.starterProjects[0]}`, `Find out about: ${path.entryRoutes[0]}`]) await addMilestone(userId, goal.id, m.slice(0, 160), null);
  return goal;
}
