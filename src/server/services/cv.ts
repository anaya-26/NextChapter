import "server-only";
import { z } from "zod";
import type { AchievementKind, Prisma } from "@/generated/prisma/client";
import { coverage, introducesNewNumbers, isEligibilityRequirement, keywords } from "@/lib/opportunity-text";
import { SECTION_KEYS, SECTION_LABELS, type SectionKey } from "@/lib/cv-sections";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { getProfile } from "./profile";
import { getOpportunity } from "./opportunities";

/**
 * CVs are built only from approved achievements, the student's education records and skills
 * they have shown. Tailoring for an opportunity reorders and rephrases — it never adds
 * experience, skills or figures that aren't in the student's own record, and every
 * rewording waits for the student's approval.
 */


const EXPERIENCE: AchievementKind[] = ["INTERNSHIP", "RESPONSIBILITY", "VOLUNTEERING", "RESEARCH"];
const PROJECTS: AchievementKind[] = ["PROJECT", "COURSEWORK"];

export type Suggestion = { achievementId: string; bullet: string; reason: string; by: "AI" | "MOCK" | "RULES" };

export type CvSections = {
  achievementIds: string[];
  educationIds: string[];
  skills: string[];
  sectionOrder: SectionKey[];
  bulletOverrides: Record<string, string>;
  pending: Suggestion[];
};

export function readSections(raw: Prisma.JsonValue): CvSections {
  const s = (raw ?? {}) as Partial<CvSections>;
  const order = (s.sectionOrder ?? []).filter((k): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k));
  return {
    achievementIds: s.achievementIds ?? [],
    educationIds: s.educationIds ?? [],
    skills: s.skills ?? [],
    sectionOrder: [...order, ...SECTION_KEYS.filter((k) => !order.includes(k))],
    bulletOverrides: s.bulletOverrides ?? {},
    pending: s.pending ?? [],
  };
}

const json = (s: CvSections) => s as unknown as Prisma.InputJsonValue;

export async function listCvs(userId: string) {
  return prisma.cv.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function getCv(userId: string, id: string) {
  return prisma.cv.findFirst({ where: { id, userId } });
}

export async function createCv(userId: string, input: { title: string; targetOpportunityId: string | null }) {
  if (input.targetOpportunityId && !(await getOpportunity(userId, input.targetOpportunityId))) throw new Error("Opportunity not found");
  const [achievements, education, profile] = await Promise.all([
    prisma.achievement.findMany({ where: { userId, approved: true }, orderBy: [{ endDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] }),
    prisma.educationRecord.findMany({ where: { userId }, orderBy: [{ current: "desc" }, { endYear: { sort: "desc", nulls: "first" } }] }),
    getProfile(userId),
  ]);
  const skills = [...new Set(achievements.flatMap((a) => a.skillsDemonstrated))];
  const sections: CvSections = {
    achievementIds: achievements.map((a) => a.id),
    educationIds: education.map((e) => e.id),
    skills,
    sectionOrder: [...SECTION_KEYS],
    bulletOverrides: {},
    pending: [],
  };
  return prisma.cv.create({
    data: {
      userId,
      title: input.title,
      targetOpportunityId: input.targetOpportunityId,
      headline: [profile.course, profile.institution].filter(Boolean).join(", ") || null,
      sections: json(sections),
      tailoringNotes: [],
    },
  });
}

export type CvPatch = { title?: string; headline?: string | null; summary?: string | null; contactLine?: string | null; achievementIds?: string[]; educationIds?: string[]; skills?: string[]; sectionOrder?: SectionKey[] };

export async function updateCv(userId: string, id: string, patch: CvPatch) {
  const cv = await getCv(userId, id);
  if (!cv) throw new Error("CV not found");
  const s = readSections(cv.sections);
  if (patch.achievementIds) {
    const own = await prisma.achievement.findMany({ where: { userId, id: { in: patch.achievementIds }, approved: true }, select: { id: true } });
    const ok = new Set(own.map((o) => o.id));
    s.achievementIds = patch.achievementIds.filter((x) => ok.has(x));
  }
  if (patch.educationIds) {
    const own = await prisma.educationRecord.findMany({ where: { userId, id: { in: patch.educationIds } }, select: { id: true } });
    const ok = new Set(own.map((o) => o.id));
    s.educationIds = patch.educationIds.filter((x) => ok.has(x));
  }
  if (patch.skills) s.skills = [...new Set(patch.skills.map((x) => x.trim()).filter(Boolean))].slice(0, 30);
  if (patch.sectionOrder) s.sectionOrder = readSections({ sectionOrder: patch.sectionOrder } as Prisma.JsonValue).sectionOrder;
  return prisma.cv.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.contactLine !== undefined ? { contactLine: patch.contactLine } : {}),
      sections: json(s),
    },
  });
}

export async function moveSection(userId: string, id: string, key: SectionKey, dir: -1 | 1) {
  const cv = await getCv(userId, id);
  if (!cv) throw new Error("CV not found");
  const s = readSections(cv.sections);
  const i = s.sectionOrder.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.sectionOrder.length) return cv;
  [s.sectionOrder[i], s.sectionOrder[j]] = [s.sectionOrder[j], s.sectionOrder[i]];
  return prisma.cv.update({ where: { id }, data: { sections: json(s) } });
}

export async function deleteCv(userId: string, id: string) {
  await prisma.cv.deleteMany({ where: { id, userId } });
}

// ───────────────────────── the document ─────────────────────────

export type CvEntry = { id: string; title: string; organisation: string | null; role: string | null; dates: string | null; lines: string[]; evidence: string[]; tailored: boolean };

const fmtMonth = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : null);

/** Everything needed to render or export a CV, resolved from approved data only. */
export async function cvDocument(userId: string, id: string) {
  const cv = await getCv(userId, id);
  if (!cv) return null;
  const s = readSections(cv.sections);
  const [achievements, education, user, profile] = await Promise.all([
    prisma.achievement.findMany({ where: { userId, id: { in: s.achievementIds } } }),
    prisma.educationRecord.findMany({ where: { userId, id: { in: s.educationIds } } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    getProfile(userId),
  ]);
  const byId = new Map(achievements.map((a) => [a.id, a]));
  const withdrawn = s.achievementIds.filter((x) => byId.get(x) && !byId.get(x)!.approved).map((x) => byId.get(x)!.title);
  const ordered = s.achievementIds.map((x) => byId.get(x)).filter((a): a is NonNullable<typeof a> => !!a && a.approved);
  const entry = (a: (typeof ordered)[number]): CvEntry => ({
    id: a.id,
    title: a.title,
    organisation: a.organisation,
    role: a.role,
    dates: a.startDate || a.endDate ? [fmtMonth(a.startDate), fmtMonth(a.endDate) ?? "present"].filter(Boolean).join(" – ") : null,
    lines: s.bulletOverrides[a.id] ? [s.bulletOverrides[a.id]] : [a.description, ...(a.outcomes ? [a.outcomes] : [])],
    evidence: a.evidenceLinks,
    tailored: !!s.bulletOverrides[a.id],
  });
  const eduById = new Map(education.map((e) => [e.id, e]));
  return {
    cv,
    sections: s,
    name: user.name || profile.displayName || "",
    withdrawn,
    order: s.sectionOrder,
    education: s.educationIds.map((x) => eduById.get(x)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({ id: e.id, line: `${e.qualification}, ${e.institution}${e.board ? ` (${e.board})` : ""}`, years: e.current ? `${e.startYear ?? ""}${e.startYear ? " – " : ""}present` : [e.startYear, e.endYear].filter(Boolean).join(" – "), result: e.result })),
    experience: ordered.filter((a) => EXPERIENCE.includes(a.kind)).map(entry),
    projects: ordered.filter((a) => PROJECTS.includes(a.kind)).map(entry),
    achievements: ordered.filter((a) => !EXPERIENCE.includes(a.kind) && !PROJECTS.includes(a.kind)).map(entry),
    skills: s.skills,
  };
}

export type CvDoc = NonNullable<Awaited<ReturnType<typeof cvDocument>>>;

export function cvToText(doc: CvDoc, format: "md" | "txt") {
  const h = (t: string) => (format === "md" ? `## ${t}` : `${t.toUpperCase()}\n${"-".repeat(t.length)}`);
  const out: string[] = [format === "md" ? `# ${doc.name}` : doc.name];
  if (doc.cv.headline) out.push(doc.cv.headline);
  if (doc.cv.contactLine) out.push(doc.cv.contactLine);
  const entries = (list: CvEntry[]) =>
    list.map((e) => [`${format === "md" ? "**" : ""}${e.title}${format === "md" ? "**" : ""}${e.organisation ? ` — ${e.organisation}` : ""}${e.role ? `, ${e.role}` : ""}${e.dates ? ` (${e.dates})` : ""}`, ...e.lines.map((l) => `- ${l}`), ...e.evidence.map((l) => `  Evidence: ${l}`)].join("\n"));
  for (const key of doc.order) {
    if (key === "summary" && doc.cv.summary) out.push(h("Summary"), doc.cv.summary);
    if (key === "education" && doc.education.length) out.push(h("Education"), doc.education.map((e) => `- ${e.line}${e.years ? ` (${e.years})` : ""}${e.result ? ` — ${e.result}` : ""}`).join("\n"));
    if (key === "experience" && doc.experience.length) out.push(h(SECTION_LABELS.experience), ...entries(doc.experience));
    if (key === "projects" && doc.projects.length) out.push(h("Projects"), ...entries(doc.projects));
    if (key === "achievements" && doc.achievements.length) out.push(h(SECTION_LABELS.achievements), ...entries(doc.achievements));
    if (key === "skills" && doc.skills.length) out.push(h("Skills"), doc.skills.join(", "));
  }
  return `${out.join("\n\n")}\n`;
}

export async function markExported(userId: string, id: string, at: Date) {
  await prisma.cv.updateMany({ where: { id, userId }, data: { lastExportedAt: at } });
}

// ───────────────────────── tailoring ─────────────────────────

const tailorSchema = z.object({
  suggestions: z.array(z.object({ achievementId: z.string(), bullet: z.string(), reason: z.string() })),
  notes: z.array(z.string()),
});

/**
 * Tailors a CV to an opportunity: relevant approved achievements first, matched skills first,
 * honest notes about requirements the student can't claim yet, and (with AI) suggested
 * rewordings that must stay within the achievement's own facts.
 */
export async function tailorCv(userId: string, cvId: string, opportunityId: string) {
  const cv = await getCv(userId, cvId);
  if (!cv) throw new Error("CV not found");
  const opp = await getOpportunity(userId, opportunityId);
  if (!opp) throw new Error("Opportunity not found");
  const s = readSections(cv.sections);
  const achievements = await prisma.achievement.findMany({ where: { userId, approved: true, id: { in: s.achievementIds } } });
  const reqs = opp.requirements.length ? opp.requirements : keywords(`${opp.title} ${opp.description ?? ""}`).slice(0, 8);
  const target = `${opp.title} ${opp.description ?? ""} ${reqs.join(" ")}`;
  const textOf = (a: (typeof achievements)[number]) => `${a.title} ${a.description} ${a.outcomes ?? ""} ${a.skillsDemonstrated.join(" ")}`;
  const relevance = new Map(achievements.map((a) => [a.id, Math.max(coverage(textOf(a), target), ...reqs.map((r) => coverage(r, textOf(a))))]));
  s.achievementIds = [...s.achievementIds].sort((x, y) => (relevance.get(y) ?? 0) - (relevance.get(x) ?? 0));
  const skillScore = (k: string) => Math.max(0, ...reqs.map((r) => coverage(r, k)), coverage(k, target));
  s.skills = [...s.skills].sort((x, y) => skillScore(y) - skillScore(x));
  const unclaimed = reqs.filter((r) => !isEligibilityRequirement(r) && !achievements.some((a) => coverage(r, textOf(a)) >= 0.5) && !s.skills.some((k) => coverage(r, k) >= 0.5));
  const notes = [
    `Ordered for ${opp.title}: most relevant entries first.`,
    ...unclaimed.map((r) => `Not claimed — no evidence yet: “${r}”. Consider a small project before applying, or mention you’re learning it in your cover note.`),
  ];

  const pending: Suggestion[] = [];
  const ai = getAiProvider();
  const rejected: string[] = [];
  if (ai && achievements.length) {
    try {
      const r = await withAi(userId, "cv_tailor", (p) =>
        p.generateObject({
          feature: "cv_tailor",
          userId,
          system: `${CORE_RULES}\n\n## Task: truthful CV tailoring\nFor the most relevant achievements, suggest one CV line each that emphasises what matters for this opportunity. Use ONLY facts in that achievement's own text: never add skills, tools, numbers, results, titles or responsibilities that are not there. Start with a strong verb, keep it under 30 words. If an achievement isn't relevant, skip it.`,
          task: `Opportunity: ${opp.title} at ${opp.organisation}. Requirements: ${JSON.stringify(reqs)}.`,
          references: achievements.map((a) => ({ id: a.id, title: `Approved achievement: ${a.title}`, text: `${a.description}\n${a.outcomes ?? ""}\nSkills shown: ${a.skillsDemonstrated.join(", ")}` })),
          schema: tailorSchema,
          effort: "medium",
        }),
      );
      const by = ai.name === "mock" ? "MOCK" : "AI";
      const own = new Map(achievements.map((a) => [a.id, a]));
      for (const x of r.data.suggestions.slice(0, 6)) {
        const a = own.get(x.achievementId);
        if (!a) continue;
        const bullet = x.bullet.trim().replace(/^[-•]\s*/, "").slice(0, 300);
        const invented = introducesNewNumbers(bullet, `${a.title} ${a.description} ${a.outcomes ?? ""}`);
        if (invented.length) {
          rejected.push(`A suggested line for “${a.title}” used figures that aren’t in your record (${invented.join(", ")}), so it was left out.`);
          continue;
        }
        pending.push({ achievementId: a.id, bullet, reason: x.reason.slice(0, 200), by });
      }
      notes.push(...r.data.notes.slice(0, 3));
    } catch {
      // ordering and notes still apply
    }
  }
  s.pending = pending;
  return prisma.cv.update({ where: { id: cvId }, data: { targetOpportunityId: opp.id, sections: json(s), tailoringNotes: [...notes, ...rejected].slice(0, 12) } });
}

export async function resolveSuggestion(userId: string, cvId: string, achievementId: string, accept: boolean) {
  const cv = await getCv(userId, cvId);
  if (!cv) throw new Error("CV not found");
  const s = readSections(cv.sections);
  const sug = s.pending.find((p) => p.achievementId === achievementId);
  if (!sug) throw new Error("Suggestion not found");
  s.pending = s.pending.filter((p) => p.achievementId !== achievementId);
  if (accept) s.bulletOverrides[achievementId] = sug.bullet;
  return prisma.cv.update({ where: { id: cvId }, data: { sections: json(s) } });
}

export async function resetOverride(userId: string, cvId: string, achievementId: string) {
  const cv = await getCv(userId, cvId);
  if (!cv) throw new Error("CV not found");
  const s = readSections(cv.sections);
  delete s.bulletOverrides[achievementId];
  return prisma.cv.update({ where: { id: cvId }, data: { sections: json(s) } });
}
