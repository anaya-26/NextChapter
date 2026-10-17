import "server-only";
import type { AchievementKind } from "@/generated/prisma/client";
import { DOMAIN_PATHS, pathFor } from "@/lib/domain-paths";
import { coverage } from "@/lib/opportunity-text";
import { isHttpUrl } from "@/lib/utils";
import { prisma } from "../db";
import { deleteFile, saveFile } from "../storage";
import { awardXp } from "./xp";

/**
 * The portfolio holds what a student has *shown* — projects, responsibilities, competitions,
 * certificates — with evidence. Nothing reaches a CV until the student approves it, and
 * editing an approved entry asks for approval again. Studying a subject is tracked
 * separately and never counted as a demonstrated skill.
 */

export const ACHIEVEMENT_KINDS: { value: AchievementKind; label: string }[] = [
  { value: "PROJECT", label: "Project" },
  { value: "COURSEWORK", label: "Coursework or lab work" },
  { value: "INTERNSHIP", label: "Internship or work" },
  { value: "RESEARCH", label: "Research" },
  { value: "RESPONSIBILITY", label: "Position of responsibility" },
  { value: "VOLUNTEERING", label: "Volunteering" },
  { value: "COMPETITION", label: "Competition" },
  { value: "AWARD", label: "Award or scholarship" },
  { value: "CERTIFICATE", label: "Certificate or course" },
  { value: "EXTRACURRICULAR", label: "Extracurricular" },
  { value: "OTHER", label: "Other" },
];

const EVIDENCE_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/;
const MAX_EVIDENCE_FILES = 3;

export type AchievementInput = {
  kind: AchievementKind;
  title: string;
  organisation: string | null;
  role: string | null;
  startMonth: string | null;
  endMonth: string | null;
  description: string;
  outcomes: string | null;
  skills: string[];
  subjects: string[];
  evidenceLinks: string[];
};

export type EvidenceUpload = { fileName: string; mime: string; data: Buffer };

const monthDate = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? new Date(`${m}-01T00:00:00Z`) : null);

function validate(input: AchievementInput) {
  const bad = input.evidenceLinks.find((l) => !isHttpUrl(l));
  if (bad) throw new Error(`“${bad}” isn’t a valid http(s) link`);
  if (input.startMonth && input.endMonth && input.endMonth < input.startMonth) throw new Error("The end month is before the start month");
}

async function storeEvidence(userId: string, files: EvidenceUpload[]) {
  const keys: string[] = [];
  for (const f of files) {
    if (!EVIDENCE_MIME.test(f.mime)) throw new Error(`“${f.fileName}” must be a PDF or an image`);
    keys.push((await saveFile({ userId, purpose: "EVIDENCE", fileName: f.fileName, mimeType: f.mime, data: f.data })).key);
  }
  return keys;
}

export async function listAchievements(userId: string) {
  return prisma.achievement.findMany({ where: { userId }, orderBy: [{ approved: "asc" }, { endDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] });
}

export async function getAchievement(userId: string, id: string) {
  return prisma.achievement.findFirst({ where: { id, userId } });
}

export async function createAchievement(userId: string, input: AchievementInput, files: EvidenceUpload[], at: Date) {
  validate(input);
  if (files.length > MAX_EVIDENCE_FILES) throw new Error(`Attach up to ${MAX_EVIDENCE_FILES} files`);
  const evidenceFileKeys = await storeEvidence(userId, files);
  return prisma.achievement.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title,
      organisation: input.organisation,
      role: input.role,
      startDate: monthDate(input.startMonth),
      endDate: monthDate(input.endMonth),
      description: input.description,
      outcomes: input.outcomes,
      skillsDemonstrated: input.skills,
      subjectsRelated: input.subjects,
      evidenceLinks: input.evidenceLinks,
      evidenceFileKeys,
      approved: false,
      createdAt: at,
    },
  });
}

/** Any change to an approved entry takes it out of CVs until the student approves it again. */
export async function updateAchievement(userId: string, id: string, input: AchievementInput, files: EvidenceUpload[], removeKeys: string[]) {
  const a = await getAchievement(userId, id);
  if (!a) throw new Error("Achievement not found");
  validate(input);
  const keep = a.evidenceFileKeys.filter((k) => !removeKeys.includes(k));
  if (keep.length + files.length > MAX_EVIDENCE_FILES) throw new Error(`Attach up to ${MAX_EVIDENCE_FILES} files`);
  const added = await storeEvidence(userId, files);
  for (const k of a.evidenceFileKeys.filter((k) => removeKeys.includes(k))) await deleteFile(k);
  return prisma.achievement.update({
    where: { id },
    data: {
      kind: input.kind,
      title: input.title,
      organisation: input.organisation,
      role: input.role,
      startDate: monthDate(input.startMonth),
      endDate: monthDate(input.endMonth),
      description: input.description,
      outcomes: input.outcomes,
      skillsDemonstrated: input.skills,
      subjectsRelated: input.subjects,
      evidenceLinks: input.evidenceLinks,
      evidenceFileKeys: [...keep, ...added],
      approved: false,
      approvedAt: null,
    },
  });
}

/** Approval puts the entry in CVs. XP once per achievement, and only with evidence attached. */
export async function approveAchievement(userId: string, id: string, at: Date) {
  const a = await getAchievement(userId, id);
  if (!a) throw new Error("Achievement not found");
  await prisma.achievement.update({ where: { id }, data: { approved: true, approvedAt: at } });
  const hasEvidence = a.evidenceLinks.length > 0 || a.evidenceFileKeys.length > 0;
  const xp = hasEvidence ? await awardXp(userId, { action: "ACHIEVEMENT_ADDED", dedupeKey: `achievement:${id}`, reason: `Added to portfolio: ${a.title}`, sourceType: "achievement", sourceId: id, at }) : null;
  return { hasEvidence, xp };
}

export async function withdrawAchievement(userId: string, id: string) {
  const r = await prisma.achievement.updateMany({ where: { id, userId }, data: { approved: false, approvedAt: null } });
  if (!r.count) throw new Error("Achievement not found");
}

export async function deleteAchievement(userId: string, id: string) {
  const a = await getAchievement(userId, id);
  if (!a) return false;
  for (const k of a.evidenceFileKeys) await deleteFile(k);
  await prisma.achievement.delete({ where: { id } });
  return true;
}

/** Things the student did elsewhere in Kadam that might belong in the portfolio (drafts only). */
export async function achievementSuggestions(userId: string) {
  const [explorations, existing, journal] = await Promise.all([
    prisma.explorationProject.findMany({ where: { userId, status: "COMPLETED" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.achievement.findMany({ where: { userId }, select: { title: true } }),
    prisma.journalEntry.findMany({ where: { userId, achievements: { not: null } }, orderBy: { date: "desc" }, take: 5, select: { id: true, date: true, achievements: true } }),
  ]);
  const titles = new Set(existing.map((e) => e.title.toLowerCase()));
  return [
    ...explorations
      .filter((e) => !titles.has(e.title.toLowerCase()))
      .map((e) => ({ key: `exploration:${e.id}`, label: `Exploration: ${e.title}`, detail: e.reflection ?? null, prefill: { kind: "PROJECT" as AchievementKind, title: e.title, description: e.description, outcomes: e.reflection ?? "" } })),
    ...journal
      .filter((j) => (j.achievements ?? "").trim().length >= 10)
      .map((j) => ({ key: `journal:${j.id}`, label: `From your journal (${j.date.toISOString().slice(0, 10)})`, detail: j.achievements, prefill: { kind: "OTHER" as AchievementKind, title: (j.achievements ?? "").split(/[.\n]/)[0].slice(0, 120), description: j.achievements ?? "", outcomes: "" } })),
  ];
}

/** Demonstrated skills (with where they were shown) vs studied subjects vs gaps in chosen directions. */
export async function skillsOverview(userId: string) {
  const [achievements, subjects, interests] = await Promise.all([
    prisma.achievement.findMany({ where: { userId, approved: true }, select: { id: true, title: true, skillsDemonstrated: true, subjectsRelated: true } }),
    prisma.subject.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.careerInterest.findMany({ where: { userId, status: { not: "DROPPED" } }, select: { domain: true } }),
  ]);
  const demonstrated = new Map<string, string[]>();
  for (const a of achievements) for (const s of a.skillsDemonstrated) demonstrated.set(s, [...(demonstrated.get(s) ?? []), a.title]);
  // Only skills and subjects the student tagged count as "shown" — not words that happen to be in a title.
  const shownText = achievements.map((a) => `${a.skillsDemonstrated.join(" ")} ${a.subjectsRelated.join(" ")}`).join(" ");
  const studied: { name: string; minutes: number; topicsStudied: number; shown: boolean }[] = [];
  for (const s of subjects) {
    const [agg, topicsStudied] = await Promise.all([
      prisma.studySession.aggregate({ where: { userId, status: { in: ["COMPLETED", "PARTIAL"] }, OR: [{ subjectId: s.id }, { topic: { syllabus: { subjectId: s.id } } }] }, _sum: { actualMinutes: true } }),
      prisma.topic.count({ where: { userId, syllabus: { subjectId: s.id }, OR: [{ status: "STUDIED" }, { studiedAt: { not: null } }] } }),
    ]);
    const minutes = agg._sum.actualMinutes ?? 0;
    if (minutes || topicsStudied) studied.push({ name: s.name, minutes, topicsStudied, shown: coverage(s.name.replace(/\(.*?\)/g, " "), shownText) >= 0.5 });
  }
  const directions = interests
    .map((i) => pathFor(i.domain))
    .filter((p): p is (typeof DOMAIN_PATHS)[number] => !!p)
    .map((p) => ({
      domain: p.domain,
      missing: p.skills.filter((skill) => ![...demonstrated.keys()].some((d) => coverage(d, skill) >= 0.5 || coverage(skill, d) >= 0.5)),
      projects: p.starterProjects,
    }));
  return { demonstrated: [...demonstrated.entries()].map(([skill, from]) => ({ skill, from })), studied, directions };
}

// ───────────────────────── education ─────────────────────────

export type EducationInput = { qualification: string; institution: string; board: string | null; startYear: number | null; endYear: number | null; current: boolean; result: string | null };

export async function listEducation(userId: string) {
  return prisma.educationRecord.findMany({ where: { userId }, orderBy: [{ current: "desc" }, { endYear: { sort: "desc", nulls: "first" } }] });
}

export async function saveEducation(userId: string, input: EducationInput, id?: string) {
  if (input.startYear && input.endYear && input.endYear < input.startYear) throw new Error("The end year is before the start year");
  if (id) {
    const r = await prisma.educationRecord.updateMany({ where: { id, userId }, data: input });
    if (!r.count) throw new Error("Education record not found");
    return prisma.educationRecord.findUniqueOrThrow({ where: { id } });
  }
  return prisma.educationRecord.create({ data: { userId, ...input } });
}

export async function deleteEducation(userId: string, id: string) {
  await prisma.educationRecord.deleteMany({ where: { id, userId } });
}
