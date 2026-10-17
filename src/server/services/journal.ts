import "server-only";
import { z } from "zod";
import type { JournalKind, MemoryKind } from "@/generated/prisma/client";
import { needsWellbeingSupport } from "@/lib/wellbeing";
import { addDaysToKey, dateOnly, localDateKey, zonedToUtc } from "@/lib/time";
import { formatDuration } from "@/lib/time";
import { prisma } from "../db";
import { env } from "../env";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { enqueueJob, PermanentJobError } from "../jobs/queue";
import { deleteFile, saveFile, uploadLimitBytes } from "../storage";
import { getPrivacy, getProfile } from "./profile";
import { addMemory } from "./memory";
import { awardXp, evaluateBadges } from "./xp";

/**
 * The private journal and study log. Entries are never shared to the community. The AI reads
 * an entry only when the student has switched on journal access in Privacy AND allowed that
 * specific entry; revoking either removes memories derived from it.
 */

export type UploadedFile = { fileName: string; mime: string; data: Buffer };

export type EntryInput = {
  kind: JournalKind;
  dateKey: string;
  title?: string | null;
  text?: string | null;
  mood?: number | null;
  energy?: number | null;
  plannedSummary?: string | null;
  actualSummary?: string | null;
  topicsStudied?: string[];
  difficulties?: string | null;
  achievements?: string | null;
  aiAccess: boolean;
  photos?: UploadedFile[];
  voice?: UploadedFile | null;
};

const IMAGE_MIME = /^image\/(png|jpe?g|webp|heic|heif)$/;
const AUDIO_MIME = /^audio\/(webm|ogg|mpeg|mp4|m4a|x-m4a|wav|aac)$/;

function wordCount(...texts: (string | null | undefined)[]) {
  return texts.filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;
}

export async function createEntry(userId: string, input: EntryInput, at: Date) {
  const profile = await getProfile(userId);
  const todayKey = localDateKey(at, profile.timezone);
  if (input.dateKey > todayKey) throw new Error("Entries can't be dated in the future");
  const photos = (input.photos ?? []).slice(0, 4);
  for (const p of photos) {
    if (!IMAGE_MIME.test(p.mime)) throw new Error(`“${p.fileName}” isn't a supported image`);
    if (p.data.length > uploadLimitBytes("document")) throw new Error(`“${p.fileName}” is too large`);
  }
  if (input.voice) {
    if (!AUDIO_MIME.test(input.voice.mime.split(";")[0])) throw new Error("Unsupported audio format");
    if (input.voice.data.length > uploadLimitBytes("media")) throw new Error("The recording is too large");
  }
  const photoKeys: string[] = [];
  for (const p of photos) photoKeys.push((await saveFile({ userId, purpose: "JOURNAL_PHOTO", fileName: p.fileName, mimeType: p.mime, data: p.data })).key);
  const voiceKey = input.voice ? (await saveFile({ userId, purpose: "JOURNAL_VOICE", fileName: input.voice.fileName, mimeType: input.voice.mime.split(";")[0], data: input.voice.data })).key : null;

  const entry = await prisma.journalEntry.create({
    data: {
      userId,
      date: dateOnly(input.dateKey),
      kind: input.kind,
      title: input.title || null,
      text: input.text || null,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      plannedSummary: input.plannedSummary || null,
      actualSummary: input.actualSummary || null,
      topicsStudied: input.topicsStudied ?? [],
      difficulties: input.difficulties || null,
      achievements: input.achievements || null,
      photoFileKeys: photoKeys,
      voiceFileKey: voiceKey,
      aiAccess: input.aiAccess,
    },
  });

  let xp = 0;
  if (input.kind === "CHECK_IN") xp += (await awardXp(userId, { action: "CHECK_IN", dedupeKey: `checkin:${input.dateKey}`, reason: "Daily check-in", sourceType: "JournalEntry", sourceId: entry.id, at })).points;
  if (input.kind === "REFLECTION" && wordCount(input.text, input.difficulties, input.achievements) >= 40) {
    xp += (await awardXp(userId, { action: "REFLECTION", dedupeKey: `reflection:${input.dateKey}`, reason: "Wrote a reflection", sourceType: "JournalEntry", sourceId: entry.id, at })).points;
  }
  await evaluateBadges(userId, at);
  if (voiceKey && env().transcriptionConfigured) await enqueueJob("journal.transcribe", { entryId: entry.id }, { userId, dedupeKey: `journal-transcribe:${entry.id}` });
  await queueAnalysis(userId, entry.id);
  return { entry, xp };
}

async function queueAnalysis(userId: string, entryId: string) {
  const privacy = await getPrivacy(userId);
  const entry = await prisma.journalEntry.findUnique({ where: { id: entryId } });
  if (!entry?.aiAccess || !privacy.aiUseJournal) return null;
  if (needsWellbeingSupport(entry.text, entry.difficulties, entry.voiceTranscript)) return null;
  return enqueueJob("journal.analyze", { entryId }, { userId, dedupeKey: `journal-analyze:${entryId}` });
}

export async function updateEntry(userId: string, id: string, patch: Partial<Omit<EntryInput, "photos" | "voice" | "kind" | "dateKey">>) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } });
  if (!entry) throw new Error("Entry not found");
  const updated = await prisma.journalEntry.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title || null } : {}),
      ...(patch.text !== undefined ? { text: patch.text || null } : {}),
      ...(patch.mood !== undefined ? { mood: patch.mood } : {}),
      ...(patch.energy !== undefined ? { energy: patch.energy } : {}),
      ...(patch.difficulties !== undefined ? { difficulties: patch.difficulties || null } : {}),
      ...(patch.achievements !== undefined ? { achievements: patch.achievements || null } : {}),
      ...(patch.topicsStudied !== undefined ? { topicsStudied: patch.topicsStudied } : {}),
      ...(patch.aiAccess !== undefined ? { aiAccess: patch.aiAccess } : {}),
    },
  });
  if (patch.aiAccess === false || (entry.aiAccess && (patch.text !== undefined || patch.difficulties !== undefined))) {
    // Revoked (or rewritten): what was learned from the old version no longer applies.
    await forgetEntry(userId, id);
  }
  if (updated.aiAccess) await queueAnalysis(userId, id);
  return updated;
}

/** Removes memories and open suggestions that came from an entry. */
async function forgetEntry(userId: string, entryId: string) {
  await prisma.memoryItem.deleteMany({ where: { userId, journalEntryId: entryId } });
  await prisma.suggestedAction.updateMany({ where: { userId, origin: "JOURNAL", sourceId: entryId, status: "PROPOSED" }, data: { status: "DISMISSED" } });
}

export async function deleteEntry(userId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } });
  if (!entry) return false;
  await forgetEntry(userId, id);
  for (const key of [...entry.photoFileKeys, ...(entry.voiceFileKey ? [entry.voiceFileKey] : [])]) await deleteFile(key);
  await prisma.journalEntry.delete({ where: { id } });
  return true;
}

export async function getEntry(userId: string, id: string) {
  return prisma.journalEntry.findFirst({ where: { id, userId }, include: { memories: { where: { status: "ACTIVE" } } } });
}

export async function listEntries(userId: string, opts: { take?: number; before?: Date } = {}) {
  return prisma.journalEntry.findMany({
    where: { userId, ...(opts.before ? { date: { lt: opts.before } } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 30,
  });
}

/* ── Study log: planned vs actual ─────────────────────────────────── */

export async function studyLog(userId: string, at: Date, days = 14) {
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const todayKey = localDateKey(at, tz);
  const fromKey = addDaysToKey(todayKey, -(days - 1));
  const from = zonedToUtc(fromKey, "00:00", tz);
  const to = zonedToUtc(addDaysToKey(todayKey, 1), "00:00", tz);
  const [sessions, checkIns] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, OR: [{ plannedStart: { gte: from, lt: to } }, { plannedStart: null, startedAt: { gte: from, lt: to } }] },
      include: { topic: { select: { id: true, title: true, syllabus: { select: { subjectId: true } } } } },
      orderBy: [{ plannedStart: "asc" }, { startedAt: "asc" }],
    }),
    prisma.journalEntry.findMany({ where: { userId, kind: "CHECK_IN", date: { gte: dateOnly(fromKey), lte: dateOnly(todayKey) } }, select: { date: true, mood: true, energy: true } }),
  ]);
  const out = [];
  for (let key = todayKey; key >= fromKey; key = addDaysToKey(key, -1)) {
    const day = sessions.filter((s) => localDateKey((s.plannedStart ?? s.startedAt)!, tz) === key);
    const checkIn = checkIns.find((c) => c.date.toISOString().slice(0, 10) === key);
    out.push({
      dateKey: key,
      plannedMinutes: day.filter((s) => s.plannedStart).reduce((sum, s) => sum + (s.plannedMinutes ?? 0), 0),
      actualMinutes: day.filter((s) => s.status === "COMPLETED" || s.status === "PARTIAL").reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0),
      sessions: day,
      mood: checkIn?.mood ?? null,
      energy: checkIn?.energy ?? null,
    });
  }
  return out;
}

/** Planned vs actual sentences for prefilling today's reflection. */
export async function daySummary(userId: string, dateKey: string, at: Date) {
  const log = await studyLog(userId, at, 14);
  const day = log.find((d) => d.dateKey === dateKey);
  if (!day || !day.sessions.length) return { planned: "", actual: "", topics: [] as string[] };
  const planned = day.sessions.filter((s) => s.plannedStart);
  const done = day.sessions.filter((s) => s.status === "COMPLETED" || s.status === "PARTIAL");
  const missed = day.sessions.filter((s) => s.status === "MISSED");
  const names = (list: typeof day.sessions) => [...new Set(list.map((s) => s.topic?.title ?? s.title ?? "Study"))].join(", ");
  return {
    planned: planned.length ? `${planned.length} session${planned.length === 1 ? "" : "s"} planned (${formatDuration(day.plannedMinutes)}): ${names(planned)}` : "",
    actual: `${done.length ? `${formatDuration(day.actualMinutes)} studied: ${names(done)}` : "Nothing logged yet"}${missed.length ? `; ${missed.length} didn’t happen` : ""}`,
    topics: [...new Set(done.map((s) => s.topic?.title).filter((t): t is string => !!t))],
  };
}

/* ── AI analysis of a shared entry (memories + suggestions) ───────── */

const MEMORY_KINDS = ["FACT", "PREFERENCE", "GOAL_CONTEXT", "OBSTACLE", "PATTERN", "STRENGTH", "DIFFICULTY"] as const;

const memorySchema = z.object({
  memories: z.array(z.object({ content: z.string(), kind: z.enum(MEMORY_KINDS), evidence: z.string() })),
});

export const SUGGESTION_TYPES = ["REVISIT_TOPIC", "PRACTICE_TOPIC", "SCHEDULE_REVISION", "PLAN_WEEK", "REVIEW_MISTAKES", "START_EXPERIMENT", "REST", "TALK_TO_SOMEONE"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const suggestionSchema = z.object({
  suggestions: z.array(z.object({ title: z.string(), reason: z.string(), type: z.enum(SUGGESTION_TYPES), topicTitle: z.string().nullable() })),
});

/** Matches a free-text topic name to one of the student's topics. */
export async function matchTopic(userId: string, title: string | null) {
  if (!title) return null;
  const t = title.toLowerCase().replace(/[’']s\b/g, "").trim();
  const topics = await prisma.topic.findMany({ where: { userId, syllabus: { status: "CONFIRMED" } }, select: { id: true, title: true, syllabus: { select: { subjectId: true } } } });
  return topics.find((x) => x.title.toLowerCase().replace(/[’']s\b/g, "") === t) ?? topics.find((x) => t.includes(x.title.toLowerCase().replace(/[’']s\b/g, "")) || x.title.toLowerCase().includes(t)) ?? null;
}

export async function analyzeEntry(entryId: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new PermanentJobError("Entry no longer exists");
  const userId = entry.userId;
  const privacy = await getPrivacy(userId);
  if (!entry.aiAccess || !privacy.aiUseJournal) return { skipped: "no permission" };
  if (needsWellbeingSupport(entry.text, entry.difficulties, entry.voiceTranscript)) return { skipped: "support shown instead" };
  const body = [
    entry.title ? `Title: ${entry.title}` : "",
    entry.text ?? "",
    entry.voiceTranscript ? `Voice note: ${entry.voiceTranscript}` : "",
    entry.achievements ? `Went well: ${entry.achievements}` : "",
    entry.difficulties ? `Difficult: ${entry.difficulties}` : "",
    entry.topicsStudied.length ? `Topics: ${entry.topicsStudied.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!body.trim()) return { skipped: "empty" };
  const ref = [{ id: `journal-${entry.id}`, title: `Journal entry ${entry.date.toISOString().slice(0, 10)}`, text: body }];
  const ai = getAiProvider();
  let memories = 0;
  let suggestions = 0;
  if (ai && privacy.aiMemoryEnabled) {
    const r = await withAi(userId, "memory_extract", (p) =>
      p.generateObject({
        feature: "memory_extract",
        userId,
        system: `${CORE_RULES}\n\n## Task: notice what's worth remembering\nFrom the student's own journal entry, extract at most 3 short, durable facts that would help plan or explain their studies (e.g. a preference, an obstacle, a strength, a recurring difficulty). Only what the entry clearly says, phrased tentatively. Skip health details, family conflict, relationships, religion, caste and money unless the student ties them directly to studying. Return an empty list if nothing qualifies.`,
        task: "Extract memories from the journal entry in the reference material.",
        references: ref,
        schema: memorySchema,
        effort: "low",
      }),
    );
    for (const m of r.data.memories.slice(0, 3)) {
      const added = await addMemory(userId, { content: m.content.slice(0, 300), kind: m.kind as MemoryKind, source: "JOURNAL", certainty: "TENTATIVE", evidence: m.evidence.slice(0, 300), journalEntryId: entry.id });
      if (added) memories++;
    }
  }
  if (ai) {
    const r = await withAi(userId, "journal_suggestions", (p) =>
      p.generateObject({
        feature: "journal_suggestions",
        userId,
        system: `${CORE_RULES}\n\n## Task: suggest a next step\nBased on the student's journal entry, suggest at most 2 small, concrete actions they could take next (revisit or practise a named topic, schedule a revision, plan the week, review mistakes, try a study experiment, or rest). Give a one-sentence reason that refers to what they wrote. If they sound overwhelmed, suggest rest or talking to someone they trust instead of more work.`,
        task: "Suggest next steps for the journal entry in the reference material.",
        references: ref,
        schema: suggestionSchema,
        effort: "low",
      }),
    );
    suggestions = await saveSuggestions(userId, "JOURNAL", entry.id, r.data.suggestions.slice(0, 2), ai.name === "mock" ? "MOCK" : "AI");
  } else if (entry.difficulties) {
    const topic = await matchTopic(userId, entry.difficulties);
    if (topic) suggestions = await saveSuggestions(userId, "JOURNAL", entry.id, [{ title: `Revisit ${topic.title}`, reason: "You mentioned it was difficult.", type: "REVISIT_TOPIC", topicTitle: topic.title }], "RULES");
  }
  return { memories, suggestions };
}

export async function saveSuggestions(
  userId: string,
  origin: "JOURNAL" | "WEEKLY_REVIEW",
  sourceId: string,
  items: { title: string; reason: string; type: SuggestionType; topicTitle: string | null; templateId?: string }[],
  by: "AI" | "MOCK" | "RULES",
) {
  await prisma.suggestedAction.deleteMany({ where: { userId, origin, sourceId, status: "PROPOSED" } });
  let n = 0;
  for (const s of items) {
    const topic = await matchTopic(userId, s.topicTitle);
    if ((s.type === "REVISIT_TOPIC" || s.type === "PRACTICE_TOPIC" || s.type === "SCHEDULE_REVISION") && !topic) continue;
    await prisma.suggestedAction.create({
      data: {
        userId,
        origin,
        sourceId,
        title: s.title.slice(0, 160),
        reason: s.reason.slice(0, 400),
        actionType: s.type,
        payload: { topicId: topic?.id ?? null, subjectId: topic?.syllabus.subjectId ?? null, templateId: s.templateId ?? null, by },
      },
    });
    n++;
  }
  return n;
}

export async function transcribeEntry(entryId: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id: entryId } });
  if (!entry?.voiceFileKey) throw new PermanentJobError("No recording");
  const { extractFromFile } = await import("./extraction");
  const { readFileBuffer } = await import("../storage");
  const result = await extractFromFile({ kind: "AUDIO", data: await readFileBuffer(entry.voiceFileKey), fileName: "voice.webm", mime: "audio/webm", language: null });
  const transcript = result.passages.map((p) => p.text).join(" ").trim();
  await prisma.journalEntry.update({ where: { id: entryId }, data: { voiceTranscript: transcript || null } });
  await queueAnalysis(entry.userId, entryId);
  return { length: transcript.length };
}
