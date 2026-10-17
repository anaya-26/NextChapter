import "server-only";
import { z } from "zod";
import type { CostType, Difficulty, ResourceType } from "@/generated/prisma/client";
import { isHttpUrl } from "@/lib/utils";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { aiStatus, getAiProvider, withAi } from "../ai";
import { enqueueJob } from "../jobs/queue";
import { getProfile } from "./profile";

type DirectoryEntry = {
  id: string;
  name: string;
  description: string;
  region: "India" | "Global";
  type: ResourceType;
  stages: string[];
  searchUrl: (q: string) => string;
};

const enc = encodeURIComponent;
const siteSearch = (site: string) => (q: string) => `https://duckduckgo.com/?q=${enc(`site:${site} ${q}`)}`;
const ALL = ["SCHOOL", "HIGHER_SECONDARY", "UNDERGRADUATE", "POSTGRADUATE", "DIPLOMA", "COMPETITIVE_EXAM", "OTHER"];

/**
 * Trusted, legitimate and (mostly) free providers. Links open a *search* on the provider —
 * they are labelled as search links, not as vetted resources.
 */
export const RESOURCE_DIRECTORY: DirectoryEntry[] = [
  { id: "ncert", name: "NCERT textbooks", description: "Official free textbooks for Classes 1–12 — the base for CBSE and many entrance exams.", region: "India", type: "OER_TEXTBOOK", stages: ["SCHOOL", "HIGHER_SECONDARY", "COMPETITIVE_EXAM"], searchUrl: siteSearch("ncert.nic.in") },
  { id: "diksha", name: "DIKSHA", description: "National platform with board-aligned school content in many Indian languages.", region: "India", type: "COURSE", stages: ["SCHOOL", "HIGHER_SECONDARY"], searchUrl: siteSearch("diksha.gov.in") },
  { id: "nptel", name: "NPTEL (IITs & IISc)", description: "Free video lectures and courses by IIT and IISc faculty.", region: "India", type: "VIDEO", stages: ["UNDERGRADUATE", "POSTGRADUATE", "DIPLOMA", "COMPETITIVE_EXAM"], searchUrl: siteSearch("nptel.ac.in") },
  { id: "swayam", name: "SWAYAM", description: "Government of India's free online courses, from school to postgraduate.", region: "India", type: "COURSE", stages: ALL, searchUrl: siteSearch("swayam.gov.in") },
  { id: "ndli", name: "National Digital Library of India", description: "Free access to textbooks, theses and papers (IIT Kharagpur).", region: "India", type: "READING", stages: ["UNDERGRADUATE", "POSTGRADUATE", "COMPETITIVE_EXAM"], searchUrl: siteSearch("ndl.iitkgp.ac.in") },
  { id: "khan", name: "Khan Academy", description: "Free practice and short videos; strong in maths and science (some Hindi content).", region: "Global", type: "PRACTICE", stages: ["SCHOOL", "HIGHER_SECONDARY", "UNDERGRADUATE", "COMPETITIVE_EXAM"], searchUrl: siteSearch("khanacademy.org") },
  { id: "openstax", name: "OpenStax", description: "Free, peer-reviewed college textbooks.", region: "Global", type: "OER_TEXTBOOK", stages: ["HIGHER_SECONDARY", "UNDERGRADUATE"], searchUrl: siteSearch("openstax.org") },
  { id: "mitocw", name: "MIT OpenCourseWare", description: "Free lecture notes, problem sets and videos from MIT.", region: "Global", type: "COURSE", stages: ["UNDERGRADUATE", "POSTGRADUATE"], searchUrl: siteSearch("ocw.mit.edu") },
  { id: "youtube", name: "YouTube", description: "Video explanations — check the channel's credibility and your syllabus version.", region: "Global", type: "VIDEO", stages: ALL, searchUrl: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { id: "wikipedia", name: "Wikipedia", description: "Quick background reading; verify details with syllabus sources.", region: "Global", type: "READING", stages: ALL, searchUrl: (q) => `https://en.wikipedia.org/w/index.php?search=${enc(q)}` },
];

export function directoryFor(stage: string | null | undefined, query: string) {
  const s = stage ?? "OTHER";
  return RESOURCE_DIRECTORY.filter((d) => d.stages.includes(s) || s === "OTHER").map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    region: d.region,
    type: d.type,
    url: d.searchUrl(query),
  }));
}

const classifySchema = z.object({
  resources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      provider: z.string().nullable(),
      type: z.enum(["READING", "VIDEO", "COURSE", "OER_TEXTBOOK", "PDF", "PRACTICE", "TOOL", "OTHER"]),
      difficulty: z.enum(["INTRO", "STANDARD", "ADVANCED"]),
      cost: z.enum(["FREE", "FREEMIUM", "PAID", "UNKNOWN"]),
      relevance: z.string(),
      legitimate: z.boolean(),
    }),
  ),
});

/** Finds resources for a topic with Claude web search. Only URLs actually returned by the search are kept. */
export async function discoverResources(userId: string, topicId: string) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId }, include: { syllabus: { include: { subject: true } } } });
  if (!topic) throw new Error("Topic not found");
  if (!aiStatus().webSearch) throw new Error("Web resource search needs AI with web search enabled.");
  const profile = await getProfile(userId);
  const level = [profile.educationStage, profile.course, profile.boardOrUniversity].filter(Boolean).join(", ") || "student";
  const ai = getAiProvider()!;
  const search = await withAi(userId, "resource_search", (p) =>
    p.searchWeb({
      feature: "resource_search",
      userId,
      system: `${CORE_RULES}\n\n## Task: find learning resources\nSearch for accessible, reputable resources. Prefer free and open resources (NCERT, NPTEL, SWAYAM, DIKSHA, OpenStax, university pages, Khan Academy, recognised educators). Include at least one reading and one video when available. Never suggest pirated or unofficially re-hosted textbooks or PDFs.`,
      task: `Find 4–6 resources for learning "${topic.title}" (subject: ${topic.syllabus.subject.name}; level: ${level}; India). Briefly say why each fits.`,
      maxSearches: 4,
    }),
  );
  if (!search.findings.length) return [];
  const candidates = search.findings.slice(0, 12);
  const classified = await withAi(userId, "resource_search", (p) =>
    p.generateObject({
      feature: "resource_search",
      userId,
      system: `${CORE_RULES}\n\nDescribe each candidate resource for a student. Use only the given URLs. Mark legitimate=false for anything that looks pirated, spammy or unrelated. Cost: FREE only if clearly free; UNKNOWN if unsure.`,
      task: `Topic: ${topic.title}. Level: ${level}.\nSearch summary: ${search.summary.slice(0, 2000)}`,
      references: candidates.map((c, i) => ({ id: `r${i}`, title: c.title, text: `URL: ${c.url}\n${c.citedText ?? ""}` })),
      schema: classifySchema,
      effort: "low",
    }),
  );
  const allowed = new Map(candidates.map((c) => [c.url, c]));
  const kept = classified.data.resources.filter((r) => r.legitimate && allowed.has(r.url) && isHttpUrl(r.url)).slice(0, 8);
  const origin = ai.name === "mock" ? "MOCK" : "AI_WEB_SEARCH";
  const created = [];
  for (const r of kept) {
    if (await prisma.resource.findFirst({ where: { userId, topicId, url: r.url } })) continue;
    created.push(
      await prisma.resource.create({
        data: {
          userId,
          topicId,
          subjectId: topic.syllabus.subjectId,
          title: r.title.slice(0, 200),
          url: r.url,
          provider: r.provider,
          type: r.type as ResourceType,
          difficulty: r.difficulty as Difficulty,
          cost: r.cost as CostType,
          relevance: r.relevance.slice(0, 600),
          origin,
          citedText: allowed.get(r.url)?.citedText?.slice(0, 400) ?? null,
        },
      }),
    );
  }
  if (created.length) await enqueueJob("resources.check", { userId, ids: created.map((c) => c.id) }, { userId });
  return created;
}

export async function addOwnResource(
  userId: string,
  input: { topicId: string | null; subjectId: string | null; title: string; url: string; type: ResourceType; cost: CostType; note: string | null },
) {
  if (!isHttpUrl(input.url)) throw new Error("Enter a full web address starting with https://");
  const topic = input.topicId ? await prisma.topic.findFirst({ where: { id: input.topicId, userId }, select: { id: true, syllabus: { select: { subjectId: true } } } }) : null;
  if (input.topicId && !topic) throw new Error("Topic not found");
  const subjectId = topic?.syllabus.subjectId ?? input.subjectId;
  if (subjectId && !(await prisma.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } }))) throw new Error("Subject not found");
  const r = await prisma.resource.create({
    data: {
      userId,
      topicId: input.topicId,
      subjectId,
      title: input.title,
      url: input.url,
      type: input.type,
      cost: input.cost,
      relevance: input.note ?? "Added by you",
      origin: "STUDENT",
      saved: true,
    },
  });
  await enqueueJob("resources.check", { userId, ids: [r.id] }, { userId });
  return r;
}

export async function setResourceFlags(userId: string, id: string, flags: { saved?: boolean; dismissed?: boolean }) {
  const res = await prisma.resource.updateMany({ where: { id, userId }, data: flags });
  return res.count === 1;
}

/** Checks links are reachable. Network failures leave the status "unchecked" rather than claiming a dead link. */
export async function checkResourceLinks(userId: string, ids: string[]) {
  const resources = await prisma.resource.findMany({ where: { userId, id: { in: ids } } });
  for (const r of resources) {
    let status: "REACHABLE" | "UNREACHABLE" | "UNCHECKED" = "UNCHECKED";
    try {
      let res = await fetch(r.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (res.status === 405 || res.status === 403) res = await fetch(r.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
      status = res.ok ? "REACHABLE" : res.status === 404 || res.status === 410 ? "UNREACHABLE" : "UNCHECKED";
    } catch {
      status = "UNCHECKED";
    }
    await prisma.resource.update({ where: { id: r.id }, data: { linkStatus: status, linkCheckedAt: new Date() } });
  }
}
