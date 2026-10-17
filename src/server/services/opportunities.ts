import "server-only";
import { z } from "zod";
import { DOMParser } from "@xmldom/xmldom";
import type { OpportunityKind, Prisma, WorkMode } from "@/generated/prisma/client";
import { OPPORTUNITY_DIRECTORY, PORTAL_TAG, STAGE_TAG } from "@/lib/opportunity-directory";
import { deadlineState, kindFromText, parsePostingText, workModeFromText, type PostingDraft } from "@/lib/opportunity-text";
import { localDateKey, localTimeKey, zonedToUtc } from "@/lib/time";
import { isHttpUrl } from "@/lib/utils";
import { prisma } from "../db";
import { env } from "../env";
import { checkLink, safeFetch } from "../net";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { enqueueJob } from "../jobs/queue";
import { createEvent, deleteEvent } from "./calendar";
import { getProfile } from "./profile";

/**
 * Opportunities come from three places, always with a source link:
 *  - DIRECTORY: a hand-written list of official programmes and portals (shared, no user data);
 *  - FEED: feeds the deployment is permitted to use (OPPORTUNITY_FEEDS), refreshed in the background;
 *  - MANUAL: links a student saves, private to them.
 * Kadam never scrapes sites that don't offer feeds. Links are checked, closed deadlines are marked
 * expired, and anything unconfirmed says so.
 */

export const visibleTo = (userId: string): Prisma.OpportunityWhereInput => ({ OR: [{ ownerId: null }, { ownerId: userId }] });

let directoryReady: Promise<void> | null = null;

/** Upserts the built-in directory (idempotent; runs once per process). */
export function ensureDirectory() {
  directoryReady ??= (async () => {
    for (const d of OPPORTUNITY_DIRECTORY) {
      const data = {
        sourceType: "DIRECTORY" as const,
        sourceName: d.sourceName,
        sourceUrl: d.sourceUrl,
        title: d.title,
        organisation: d.organisation,
        kind: d.kind,
        description: d.description,
        eligibility: d.eligibility,
        educationRequirements: d.educationRequirements,
        location: d.location,
        workMode: d.workMode,
        duration: d.duration,
        compensation: d.compensation,
        deadlineText: d.deadlineText,
        isRecurring: true,
        requirements: d.requirements,
        domains: d.domains,
        tags: [...d.stages.map(STAGE_TAG), ...(d.isPortal ? [PORTAL_TAG] : [])],
      };
      await prisma.opportunity.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
    }
  })().catch((e) => {
    directoryReady = null;
    throw e;
  });
  return directoryReady;
}

export type OpportunityFilters = {
  q?: string;
  kind?: OpportunityKind | "";
  mode?: WorkMode | "";
  /** Include items outside the student's education stage. */
  allStages?: boolean;
  includeClosed?: boolean;
};

export type RankedOpportunity = Awaited<ReturnType<typeof listOpportunities>>[number];

/** Opportunities the student can see, ranked by fit, each with plain reasons. */
export async function listOpportunities(userId: string, filters: OpportunityFilters, at: Date) {
  await ensureDirectory();
  const [profile, interests, saved] = await Promise.all([
    getProfile(userId),
    prisma.careerInterest.findMany({ where: { userId, status: { not: "DROPPED" } } }),
    prisma.application.findMany({ where: { userId }, select: { opportunityId: true, status: true, id: true } }),
  ]);
  const q = filters.q?.trim();
  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        visibleTo(userId),
        filters.kind ? { kind: filters.kind } : {},
        filters.mode ? { workMode: filters.mode } : {},
        filters.includeClosed ? {} : { verification: { not: "EXPIRED" } },
        q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { organisation: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] } : {},
      ],
    },
    take: 200,
  });
  const domains = interests.map((i) => i.domain.toLowerCase());
  const cities = interests.flatMap((i) => i.cities.map((c) => c.toLowerCase()));
  const modes = new Set(interests.flatMap((i) => i.workModes));
  const savedBy = new Map(saved.map((s) => [s.opportunityId, s]));
  const stage = profile.educationStage;
  const ranked = rows.map((o) => {
    const reasons: string[] = [];
    let score = 0;
    const stages = o.tags.filter((t) => t.startsWith("stage:")).map((t) => t.slice(6));
    const stageFit = !stage || !stages.length ? null : stages.includes(stage);
    if (stageFit) {
      score += 3;
      reasons.push("Fits your education stage");
    }
    for (const d of o.domains) {
      if (domains.includes(d.toLowerCase())) {
        score += 2;
        reasons.push(`Matches your interest in ${d}`);
      }
    }
    const city = cities.find((c) => o.location?.toLowerCase().includes(c));
    if (city) {
      score += 1;
      reasons.push(`In ${o.location}`);
    }
    if (modes.has(o.workMode as "REMOTE" | "ONSITE" | "HYBRID")) {
      score += 1;
      reasons.push(`${o.workMode === "REMOTE" ? "Remote" : o.workMode === "HYBRID" ? "Hybrid" : "On-site"}, as you prefer`);
    }
    const state = o.isRecurring ? "UNKNOWN" : deadlineState(o.deadline, at);
    if (state === "CLOSING_SOON") score += 1;
    if (o.ownerId) score += 1;
    return { ...o, score, reasons, stageFit, deadlineState: state, isPortal: o.tags.includes(PORTAL_TAG), application: savedBy.get(o.id) ?? null };
  });
  return ranked
    .filter((o) => filters.allStages || o.stageFit !== false || o.application)
    .sort((a, b) => b.score - a.score || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.title.localeCompare(b.title));
}

export async function getOpportunity(userId: string, id: string) {
  return prisma.opportunity.findFirst({ where: { AND: [{ id }, visibleTo(userId)] } });
}

// ───────────────────────── manual links ─────────────────────────

const extractSchema = z.object({
  title: z.string().nullable(),
  organisation: z.string().nullable(),
  kind: z.enum(["INTERNSHIP", "PROGRAMME", "COMPETITION", "SCHOLARSHIP", "RESEARCH", "FELLOWSHIP", "HACKATHON", "JOB", "OTHER"]),
  eligibility: z.string().nullable(),
  educationRequirements: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.enum(["REMOTE", "ONSITE", "HYBRID", "UNKNOWN"]),
  duration: z.string().nullable(),
  compensation: z.string().nullable(),
  deadline: z.string().nullable().describe("YYYY-MM-DD only if a specific date is stated, else null"),
  requirements: z.array(z.string()),
});

export type ManualInput = {
  sourceUrl: string;
  postingText: string | null;
  title: string | null;
  organisation: string | null;
  kind: OpportunityKind | null;
  location: string | null;
  workMode: WorkMode | null;
  deadline: string | null;
  compensation: string | null;
};

/** Reads a pasted posting: AI when available (labelled), otherwise rules. Never invents fields. */
export async function extractPosting(userId: string, text: string, at: Date): Promise<{ draft: PostingDraft; by: "AI" | "MOCK" | "RULES" }> {
  const profile = await getProfile(userId);
  const rules = parsePostingText(text, at, profile.timezone);
  const ai = getAiProvider();
  if (!ai) return { draft: rules, by: "RULES" };
  try {
    const r = await withAi(userId, "opportunity_extract", (p) =>
      p.generateObject({
        feature: "opportunity_extract",
        userId,
        system: `${CORE_RULES}\n\n## Task: read an opportunity posting\nCopy details exactly as the posting states them. Use null for anything not stated — never guess stipends, dates or eligibility. Requirements are short phrases (skills, qualifications, documents) the posting asks for.`,
        task: `Today is ${localDateKey(at, profile.timezone)} (${profile.timezone}). Extract the posting's details. Rule-based reading for reference: ${JSON.stringify(rules)}`,
        references: [{ id: "posting", title: "Posting text pasted by the student", text: text.slice(0, 15000) }],
        schema: extractSchema,
        effort: "low",
      }),
    );
    const d = r.data;
    // A date is kept only if the posting visibly states it — models can misread or guess dates.
    const deadlineKey = d.deadline && /^\d{4}-\d{2}-\d{2}$/.test(d.deadline) && (d.deadline === rules.deadlineKey || mentionsDate(text, d.deadline)) ? d.deadline : null;
    return {
      draft: {
        title: d.title,
        organisation: d.organisation,
        kind: d.kind,
        eligibility: d.eligibility,
        educationRequirements: d.educationRequirements,
        location: d.location,
        workMode: d.workMode,
        duration: d.duration,
        compensation: d.compensation,
        deadlineKey,
        deadlineText: deadlineKey ? rules.deadlineText : null,
        requirements: d.requirements.map((x) => x.trim()).filter(Boolean).slice(0, 12),
      },
      by: ai.name === "mock" ? "MOCK" : "AI",
    };
  } catch {
    return { draft: rules, by: "RULES" };
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function mentionsDate(text: string, key: string) {
  const [, m, d] = key.split("-").map(Number);
  const t = text.toLowerCase();
  const day = `\\b0?${d}(st|nd|rd|th)?\\b`;
  return new RegExp(`${day}[\\s,./-]*(${MONTHS[m - 1]}|0?${m}\\b)`).test(t) || new RegExp(`${MONTHS[m - 1]}[a-z]*[\\s,.]*${day}`).test(t);
}

export async function addManualOpportunity(userId: string, input: ManualInput, at: Date) {
  if (!isHttpUrl(input.sourceUrl)) throw new Error("Add the link to the original posting (http or https)");
  const profile = await getProfile(userId);
  const { draft, by } = input.postingText ? await extractPosting(userId, input.postingText, at) : { draft: null, by: "STUDENT" as const };
  const deadlineKey = input.deadline ?? draft?.deadlineKey ?? null;
  const title = input.title ?? draft?.title;
  if (!title) throw new Error("Give the opportunity a title (or paste the posting text so Kadam can read it)");
  const host = new URL(input.sourceUrl).hostname.replace(/^www\./, "");
  const opp = await prisma.opportunity.create({
    data: {
      ownerId: userId,
      sourceType: "MANUAL",
      sourceName: host,
      sourceUrl: input.sourceUrl,
      title: title.slice(0, 160),
      organisation: (input.organisation ?? draft?.organisation ?? host).slice(0, 160),
      kind: input.kind ?? draft?.kind ?? kindFromText(`${title} ${input.postingText ?? ""}`),
      description: input.postingText ? input.postingText.slice(0, 4000) : null,
      eligibility: draft?.eligibility ?? null,
      educationRequirements: draft?.educationRequirements ?? null,
      location: input.location ?? draft?.location ?? null,
      workMode: input.workMode ?? draft?.workMode ?? workModeFromText(input.location ?? ""),
      duration: draft?.duration ?? null,
      compensation: input.compensation ?? draft?.compensation ?? null,
      deadline: deadlineKey ? zonedToUtc(deadlineKey, "23:59", profile.timezone) : null,
      deadlineText: deadlineKey ? null : "Not stated — check the posting",
      requirements: draft?.requirements ?? [],
      tags: [`read-by:${by}`],
      verification: "UNVERIFIED",
    },
  });
  await enqueueJob("opportunities.check", { ids: [opp.id] }, { userId, maxAttempts: 1 });
  const application = await saveOpportunity(userId, opp.id, at);
  return { opportunity: opp, application, readBy: by };
}

export async function updateManualOpportunity(userId: string, id: string, patch: Partial<Pick<ManualInput, "title" | "organisation" | "location" | "compensation" | "deadline">> & { requirements?: string[] }) {
  const opp = await prisma.opportunity.findFirst({ where: { id, ownerId: userId } });
  if (!opp) throw new Error("Only links you added can be edited");
  const profile = await getProfile(userId);
  return prisma.opportunity.update({
    where: { id },
    data: {
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.organisation !== undefined ? { organisation: patch.organisation ?? opp.organisation } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.compensation !== undefined ? { compensation: patch.compensation } : {}),
      ...(patch.deadline !== undefined ? { deadline: patch.deadline ? zonedToUtc(patch.deadline, "23:59", profile.timezone) : null, deadlineText: patch.deadline ? null : "Not stated — check the posting", verification: opp.verification === "EXPIRED" ? "UNVERIFIED" : opp.verification } : {}),
      ...(patch.requirements ? { requirements: patch.requirements.slice(0, 15) } : {}),
    },
  });
}

export async function deleteManualOpportunity(userId: string, id: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id, ownerId: userId }, include: { applications: { include: { calendarEvents: { select: { id: true } } } } } });
  if (!opp) return false;
  for (const a of opp.applications) for (const e of a.calendarEvents) await deleteEvent(userId, e.id);
  await prisma.opportunity.delete({ where: { id } });
  return true;
}

// ───────────────────────── saving ─────────────────────────

/** Saving creates an application tracker and, when a deadline is known, a calendar deadline with countdown. */
export async function saveOpportunity(userId: string, opportunityId: string, at: Date) {
  const opp = await getOpportunity(userId, opportunityId);
  if (!opp) throw new Error("Opportunity not found");
  const application = await prisma.application.upsert({
    where: { userId_opportunityId: { userId, opportunityId } },
    create: { userId, opportunityId },
    update: {},
  });
  if (opp.deadline && opp.deadline > at) {
    const existing = await prisma.calendarEvent.findFirst({ where: { userId, applicationId: application.id, isDeadline: true } });
    if (!existing) {
      const profile = await getProfile(userId);
      const start = new Date(opp.deadline.getTime() - 15 * 60_000);
      await createEvent(userId, {
        title: `Deadline: ${opp.title}`,
        kind: "APPLICATION",
        dateKey: localDateKey(start, profile.timezone),
        startTime: localTimeKey(start, profile.timezone),
        durationMinutes: 15,
        allDay: false,
        rrule: null,
        description: `Source: ${opp.sourceUrl}`,
        reminderMinutes: [24 * 60],
        showCountdown: true,
        isDeadline: true,
        applicationId: application.id,
      });
    }
  }
  return application;
}

export async function unsaveOpportunity(userId: string, opportunityId: string) {
  const app = await prisma.application.findFirst({ where: { userId, opportunityId }, include: { calendarEvents: { select: { id: true } } } });
  if (!app) return false;
  for (const e of app.calendarEvents) await deleteEvent(userId, e.id);
  await prisma.application.delete({ where: { id: app.id } });
  return true;
}

// ───────────────────────── verification & expiry ─────────────────────────

export async function checkOpportunityLinks(ids: string[], at: Date) {
  const opps = await prisma.opportunity.findMany({ where: { id: { in: ids } } });
  for (const o of opps) {
    const status = await checkLink(o.sourceUrl);
    if (status === "UNCHECKED") continue; // couldn't tell — don't claim anything
    await prisma.opportunity.update({
      where: { id: o.id },
      data: {
        linkStatus: status,
        lastCheckedAt: at,
        verification: o.verification === "EXPIRED" ? "EXPIRED" : status === "REACHABLE" ? "SOURCE_LINKED" : "LINK_BROKEN",
      },
    });
  }
}

/** Marks one-off opportunities whose deadline has passed. Recurring programmes never expire. */
export async function expireOpportunities(at: Date) {
  const r = await prisma.opportunity.updateMany({ where: { isRecurring: false, deadline: { lt: at }, verification: { not: "EXPIRED" } }, data: { verification: "EXPIRED" } });
  return r.count;
}

// ───────────────────────── permitted feeds ─────────────────────────

const feedConfigSchema = z.array(
  z.object({
    name: z.string().min(1),
    url: z.string().url(),
    format: z.enum(["rss", "atom", "json"]),
    permittedNote: z.string().min(1).describe("Why this deployment may use the feed (licence/terms)"),
  }),
);

export function feedConfig() {
  const raw = env().OPPORTUNITY_FEEDS;
  if (!raw) return [];
  const parsed = feedConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("OPPORTUNITY_FEEDS must be a JSON list of {name, url, format, permittedNote}");
  return parsed.data;
}

type FeedItem = { externalId: string; title: string; url: string; organisation: string | null; description: string | null; deadline: string | null; location: string | null; kind: string | null; workMode: string | null; compensation: string | null; eligibility: string | null; duration: string | null };

const jsonItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  url: z.string().url(),
  organisation: z.string().nullish(),
  description: z.string().nullish(),
  deadline: z.string().nullish(),
  location: z.string().nullish(),
  kind: z.string().nullish(),
  workMode: z.string().nullish(),
  compensation: z.string().nullish(),
  eligibility: z.string().nullish(),
  duration: z.string().nullish(),
});

export function parseFeed(body: string, format: "rss" | "atom" | "json"): FeedItem[] {
  if (format === "json") {
    const data = JSON.parse(body) as unknown;
    const items = Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? []);
    return items.flatMap((x) => {
      const r = jsonItemSchema.safeParse(x);
      if (!r.success) return [];
      const i = r.data;
      return [{ externalId: i.id, title: i.title, url: i.url, organisation: i.organisation ?? null, description: i.description ?? null, deadline: i.deadline ?? null, location: i.location ?? null, kind: i.kind ?? null, workMode: i.workMode ?? null, compensation: i.compensation ?? null, eligibility: i.eligibility ?? null, duration: i.duration ?? null }];
    });
  }
  const doc = new DOMParser().parseFromString(body, "text/xml");
  const text = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || null;
  const nodes = Array.from(doc.getElementsByTagName(format === "rss" ? "item" : "entry") as unknown as ArrayLike<Element>);
  return nodes.flatMap((el) => {
    const link = format === "rss" ? text(el, "link") : (el.getElementsByTagName("link")[0]?.getAttribute("href") ?? null);
    const title = text(el, "title");
    if (!link || !title || !isHttpUrl(link)) return [];
    const description = (text(el, "description") ?? text(el, "summary") ?? text(el, "content"))?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;
    return [{ externalId: text(el, "guid") ?? text(el, "id") ?? link, title, url: link, organisation: text(el, "author") ?? text(el, "name"), description, deadline: null, location: null, kind: null, workMode: null, compensation: null, eligibility: null, duration: null }];
  });
}

export async function refreshFeeds(at: Date) {
  const feeds = feedConfig();
  const out: { feed: string; items: number; error?: string }[] = [];
  for (const f of feeds) {
    const feed = await prisma.opportunityFeed.upsert({ where: { url: f.url }, create: { name: f.name, url: f.url, format: f.format, permittedNote: f.permittedNote }, update: { name: f.name, format: f.format, permittedNote: f.permittedNote, enabled: true } });
    try {
      const res = await safeFetch(f.url, { method: "GET", maxBytes: 3 * 1024 * 1024, timeoutMs: 15000, accept: f.format === "json" ? "application/json" : "application/rss+xml, application/atom+xml, text/xml" });
      if (!res.ok || !res.body) throw new Error(`Feed answered ${res.status}`);
      const items = parseFeed(res.body, f.format).slice(0, 300);
      for (const i of items) {
        const posting = parsePostingText(`${i.title}\n${i.description ?? ""}`, at, "Asia/Kolkata");
        const deadlineKey = i.deadline && /^\d{4}-\d{2}-\d{2}/.test(i.deadline) ? i.deadline.slice(0, 10) : posting.deadlineKey;
        const kind = (["INTERNSHIP", "PROGRAMME", "COMPETITION", "SCHOLARSHIP", "RESEARCH", "FELLOWSHIP", "HACKATHON", "JOB", "OTHER"] as const).find((k) => k === i.kind?.toUpperCase()) ?? kindFromText(`${i.title} ${i.description ?? ""}`);
        const workMode = (["REMOTE", "ONSITE", "HYBRID"] as const).find((m) => m === i.workMode?.toUpperCase()) ?? workModeFromText(`${i.location ?? ""} ${i.description ?? ""}`);
        const data = {
          sourceType: "FEED" as const,
          sourceName: f.name,
          sourceUrl: i.url,
          title: i.title.slice(0, 160),
          organisation: (i.organisation ?? posting.organisation ?? f.name).slice(0, 160),
          kind,
          description: i.description?.slice(0, 4000) ?? null,
          eligibility: i.eligibility ?? posting.eligibility,
          location: i.location ?? posting.location,
          workMode,
          duration: i.duration ?? posting.duration,
          compensation: i.compensation ?? posting.compensation,
          deadline: deadlineKey ? zonedToUtc(deadlineKey, "23:59", "Asia/Kolkata") : null,
          deadlineText: deadlineKey ? null : "Not stated in the feed — check the source",
          requirements: posting.requirements,
        };
        await prisma.opportunity.upsert({ where: { feedId_externalId: { feedId: feed.id, externalId: i.externalId } }, create: { ...data, feedId: feed.id, externalId: i.externalId }, update: data });
      }
      await prisma.opportunityFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: at, lastError: null } });
      out.push({ feed: f.name, items: items.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Feed failed";
      await prisma.opportunityFeed.update({ where: { id: feed.id }, data: { lastError: message.slice(0, 300) } });
      out.push({ feed: f.name, items: 0, error: message });
    }
  }
  return out;
}

/** Background upkeep: expiry, permitted feeds, and link checks for anything not checked in a week. */
export async function maintainOpportunities(at: Date) {
  await ensureDirectory();
  const expired = await expireOpportunities(at);
  const feeds = feedConfig().length ? await refreshFeeds(at) : [];
  const stale = await prisma.opportunity.findMany({
    where: { verification: { not: "EXPIRED" }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(at.getTime() - 7 * 86400000) } }] },
    select: { id: true },
    take: 40,
  });
  await checkOpportunityLinks(stale.map((s) => s.id), at);
  return { expired, feeds, checked: stale.length };
}
