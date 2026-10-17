import "server-only";
import path from "node:path";
import { z } from "zod";
import type { CoverageStatus, SourceKind } from "@/generated/prisma/client";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { enqueueJob, PermanentJobError } from "../jobs/queue";
import { readFileBuffer, saveFile, uploadLimitBytes } from "../storage";
import { chunkText, detectKind, extractFromFile, isMediaKind, NeedsSetupError, type Passage } from "./extraction";
import { chunkCues, parseCaptions } from "@/lib/captions";

export type UploadedMaterial = { fileName: string; mime: string; data: Buffer };

/** Creates material sources for a subject and queues processing. Captions are paired with media by file name. */
export async function addMaterials(userId: string, subjectId: string, files: UploadedMaterial[], opts: { topicId?: string | null; language?: string | null } = {}) {
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) throw new Error("Subject not found");
  const topic = opts.topicId ? await prisma.topic.findFirst({ where: { id: opts.topicId, userId } }) : null;

  const prepared = files.map((f) => {
    const kind = detectKind(f.fileName, f.mime);
    if (!kind) throw new Error(`“${f.fileName}” isn't a supported file type.`);
    const limit = uploadLimitBytes(isMediaKind(kind) ? "media" : "document");
    if (f.data.length > limit) throw new Error(`“${f.fileName}” is over the ${Math.round(limit / 1024 / 1024)} MB limit for this file type.`);
    return { ...f, kind };
  });

  const created: { id: string; kind: SourceKind; base: string }[] = [];
  for (const f of prepared) {
    const stored = await saveFile({ userId, purpose: "SOURCE", fileName: f.fileName, mimeType: f.mime, data: f.data });
    const source = await prisma.source.create({
      data: {
        userId,
        subjectId,
        role: "MATERIAL",
        kind: f.kind,
        origin: "UPLOAD",
        title: f.fileName,
        fileKey: stored.key,
        fileName: f.fileName,
        mimeType: f.mime,
        sizeBytes: f.data.length,
        language: opts.language ?? null,
      },
    });
    created.push({ id: source.id, kind: f.kind, base: path.parse(f.fileName).name.toLowerCase() });
    if (topic) {
      await prisma.topicSource.create({ data: { topicId: topic.id, sourceId: source.id, coverage: "PARTIAL", method: "MANUAL", matchedChunkIds: [], note: "Added for this topic" } });
    }
  }
  // Pair caption files with the recording they belong to.
  for (const c of created.filter((x) => x.kind === "CAPTIONS")) {
    const media = created.find((m) => isMediaKind(m.kind) && m.base === c.base) ?? (created.filter((m) => isMediaKind(m.kind)).length === 1 ? created.find((m) => isMediaKind(m.kind)) : undefined);
    if (media) await prisma.source.update({ where: { id: c.id }, data: { captionsForId: media.id } });
  }
  for (const s of created) {
    await enqueueJob("source.process", { sourceId: s.id }, { userId, dedupeKey: `source:${s.id}` });
  }
  return created.map((c) => c.id);
}

export async function addPastedMaterial(userId: string, subjectId: string, title: string, text: string) {
  return addMaterials(userId, subjectId, [{ fileName: `${title.replace(/[^\w\- ]+/g, "").slice(0, 60) || "notes"}.txt`, mime: "text/plain", data: Buffer.from(text, "utf8") }]);
}

const IMAGE_SCHEMA = z.object({ text: z.string(), diagrams: z.array(z.string()), unreadable: z.boolean() });

async function readImageWithAi(userId: string, data: Buffer, mediaType: string, name: string): Promise<Passage[]> {
  const result = await withAi(userId, "image_read", (ai) =>
    ai.generateObject({
      feature: "image_read",
      userId,
      system: `${CORE_RULES}\n\nTranscribe study material from an image faithfully. Keep formulas (use LaTeX between $…$). Briefly describe any diagram in "diagrams". Set unreadable=true if most text can't be read.`,
      task: "Transcribe this image.",
      attachments: [{ kind: "image", mediaType, base64: data.toString("base64"), name }],
      schema: IMAGE_SCHEMA,
      effort: "low",
    }),
  );
  const text = [result.data.text, ...result.data.diagrams.map((d) => `[Diagram] ${d}`)].join("\n\n");
  return chunkText(text);
}

/** Background job: extract → passages → coverage. */
export async function processSource(sourceId: string, progress: (pct: number, message?: string) => Promise<void>) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new PermanentJobError("Source no longer exists");
  await prisma.source.update({ where: { id: sourceId }, data: { status: "PROCESSING", progress: 10, error: null } });

  try {
    // A caption file paired with a recording becomes that recording's transcript.
    if (source.kind === "CAPTIONS" && source.captionsForId) {
      await prisma.source.update({ where: { id: sourceId }, data: { status: "READY", progress: 100, statusMessage: "Used as the transcript of its recording" } });
      await enqueueJob("source.process", { sourceId: source.captionsForId }, { userId: source.userId, dedupeKey: `source:${source.captionsForId}:captions` });
      return { passages: 0 };
    }
    const data = await readFileBuffer(source.fileKey!);
    await progress(30, "Reading file");
    let passages: Passage[];
    let method: string;
    let durationSec: number | undefined;
    let pageCount: number | undefined;
    const warnings: string[] = [];

    const captions = isMediaKind(source.kind) ? await prisma.source.findFirst({ where: { captionsForId: source.id, userId: source.userId } }) : null;
    const ai = getAiProvider();
    if (captions) {
      const cues = parseCaptions((await readFileBuffer(captions.fileKey!)).toString("utf8"));
      passages = chunkCues(cues).map((c) => ({ page: null, text: c.text, startSec: c.start, endSec: c.end }));
      method = "captions";
      durationSec = cues.length ? Math.round(cues[cues.length - 1].end) : undefined;
    } else if (source.kind === "IMAGE" && ai?.name === "anthropic") {
      passages = await readImageWithAi(source.userId, data, source.mimeType ?? "image/png", source.title);
      method = "ai-vision";
    } else {
      const extracted = await extractFromFile({ kind: source.kind, data, fileName: source.fileName ?? source.title, mime: source.mimeType ?? "", language: source.language });
      passages = extracted.passages;
      method = extracted.method;
      durationSec = extracted.durationSec;
      pageCount = extracted.pageCount;
      warnings.push(...extracted.warnings);
    }
    await progress(70, "Indexing passages");
    await prisma.$transaction([
      prisma.sourceChunk.deleteMany({ where: { sourceId } }),
      prisma.sourceChunk.createMany({
        data: passages
          .filter((p) => p.text.trim())
          .map((p, i) => ({
            sourceId,
            userId: source.userId,
            ordinal: i,
            text: p.text.slice(0, 8000),
            page: p.page ?? null,
            startSec: p.startSec ?? null,
            endSec: p.endSec ?? null,
            heading: p.heading ?? null,
          })),
      }),
    ]);
    const textLength = passages.reduce((s, p) => s + p.text.length, 0);
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        progress: 100,
        extractionMethod: method,
        textLength,
        durationSec: durationSec ?? null,
        pageCount: pageCount ?? null,
        statusMessage: warnings.join(" ") || null,
      },
    });
    if (source.subjectId) await computeCoverage(source.userId, source.subjectId);
    return { passages: passages.length };
  } catch (error) {
    const needsSetup = error instanceof NeedsSetupError;
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: needsSetup ? "NEEDS_SETUP" : "FAILED", progress: 100, error: error instanceof Error ? error.message : "Processing failed" },
    });
    if (needsSetup) throw new PermanentJobError(error instanceof Error ? error.message : "Needs setup");
    throw error;
  }
}

/* ── Retrieval ──────────────────────────────────────────────────────── */

export type FoundPassage = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  text: string;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  rank: number;
};

const STOP = new Set(["and", "the", "of", "in", "to", "its", "a", "an", "for", "with", "on", "by", "from", "their", "applications", "introduction", "basic", "concept", "concepts"]);

export function significantWords(title: string): string[] {
  return [...new Set(title.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)))];
}

/** Full-text search over the student's materials for a subject (Postgres tsvector, English stemming). */
export async function searchPassages(userId: string, subjectId: string, query: string, opts: { limit?: number; mode?: "all" | "any" } = {}) {
  const words = significantWords(query);
  if (!words.length) return [];
  const q = opts.mode === "any" ? words.join(" OR ") : words.join(" ");
  return prisma.$queryRaw<FoundPassage[]>`
    SELECT c.id, c."sourceId", s.title AS "sourceTitle", s.kind AS "sourceKind", c.text, c.page, c."startSec", c."endSec",
           ts_rank(to_tsvector('english', c.text), q) AS rank
    FROM "SourceChunk" c
    JOIN "Source" s ON s.id = c."sourceId",
         websearch_to_tsquery('english', ${q}) q
    WHERE c."userId" = ${userId} AND s."subjectId" = ${subjectId} AND s.role = 'MATERIAL'
      AND to_tsvector('english', c.text) @@ q
    ORDER BY rank DESC
    LIMIT ${opts.limit ?? 8}`;
}

/**
 * Compares uploaded materials with the confirmed syllabus. Coverage is a keyword estimate:
 * COVERED = substantial passages contain all the topic's key words; PARTIAL = brief or partial
 * matches; MISSING = nothing found. Manually linked materials always count.
 */
export async function computeCoverage(userId: string, subjectId: string) {
  const materials = await prisma.source.count({ where: { userId, subjectId, role: "MATERIAL", status: "READY" } });
  const topics = await prisma.topic.findMany({
    where: { userId, syllabus: { subjectId, status: "CONFIRMED" } },
    include: { sourceLinks: { where: { method: "MANUAL" } } },
  });
  for (const topic of topics) {
    const strong = await searchPassages(userId, subjectId, topic.title, { mode: "all", limit: 10 });
    const words = significantWords(topic.title);
    const weak = words.length > 1 ? (await searchPassages(userId, subjectId, topic.title, { mode: "any", limit: 10 })).filter((p) => !strong.some((s) => s.id === p.id)) : [];
    const strongChars = strong.reduce((s, p) => s + p.text.length, 0);
    let coverage: CoverageStatus = "UNKNOWN";
    if (materials > 0) {
      if (strong.length >= 2 || strongChars >= 500) coverage = "COVERED";
      else if (strong.length === 1 || weak.length >= 2 || topic.sourceLinks.length) coverage = "PARTIAL";
      else coverage = "MISSING";
    }
    if (topic.sourceLinks.length && coverage === "MISSING") coverage = "PARTIAL";
    const bySource = new Map<string, { ids: string[]; strong: boolean; score: number }>();
    for (const p of [...strong.map((s) => ({ ...s, strong: true })), ...weak.map((w) => ({ ...w, strong: false }))]) {
      const cur = bySource.get(p.sourceId) ?? { ids: [], strong: false, score: 0 };
      cur.ids.push(p.id);
      cur.strong ||= p.strong;
      cur.score += Number(p.rank);
      bySource.set(p.sourceId, cur);
    }
    await prisma.$transaction([
      prisma.topicSource.deleteMany({ where: { topicId: topic.id, method: "KEYWORD" } }),
      ...[...bySource.entries()].map(([sourceId, v]) =>
        prisma.topicSource.upsert({
          where: { topicId_sourceId: { topicId: topic.id, sourceId } },
          create: { topicId: topic.id, sourceId, coverage: v.strong ? "COVERED" : "PARTIAL", method: "KEYWORD", score: v.score, matchedChunkIds: v.ids },
          update: { matchedChunkIds: v.ids, score: v.score },
        }),
      ),
      prisma.topic.update({ where: { id: topic.id }, data: { coverage } }),
    ]);
  }
}

/** Passages most relevant to a topic, for lessons and practice (linked passages first). */
export async function passagesForTopic(userId: string, topicId: string, limit = 8): Promise<FoundPassage[]> {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId }, include: { syllabus: { select: { subjectId: true } }, sourceLinks: true } });
  if (!topic) return [];
  const subjectId = topic.syllabus.subjectId;
  let found = await searchPassages(userId, subjectId, `${topic.title} ${topic.objectives.join(" ")}`.slice(0, 300), { mode: "all", limit });
  if (found.length < 3) {
    const more = await searchPassages(userId, subjectId, topic.title, { mode: "any", limit });
    found = [...found, ...more.filter((m) => !found.some((f) => f.id === m.id))];
  }
  const manualSources = topic.sourceLinks.filter((l) => l.method === "MANUAL").map((l) => l.sourceId);
  if (manualSources.length && found.length < limit) {
    const chunks = await prisma.sourceChunk.findMany({
      where: { sourceId: { in: manualSources }, userId },
      include: { source: { select: { title: true, kind: true } } },
      orderBy: { ordinal: "asc" },
      take: limit - found.length,
    });
    found.push(
      ...chunks
        .filter((c) => !found.some((f) => f.id === c.id))
        .map((c) => ({ id: c.id, sourceId: c.sourceId, sourceTitle: c.source.title, sourceKind: c.source.kind, text: c.text, page: c.page, startSec: c.startSec, endSec: c.endSec, rank: 0 })),
    );
  }
  return found.slice(0, limit);
}

export async function listMaterials(userId: string, subjectId: string) {
  return prisma.source.findMany({
    where: { userId, subjectId, role: "MATERIAL" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
}

export async function deleteMaterial(userId: string, sourceId: string) {
  const source = await prisma.source.findFirst({ where: { id: sourceId, userId } });
  if (!source) return false;
  await prisma.source.delete({ where: { id: sourceId } });
  if (source.fileKey) {
    const { deleteFile } = await import("../storage");
    await deleteFile(source.fileKey);
  }
  if (source.subjectId) await computeCoverage(userId, source.subjectId);
  return true;
}

export async function retrySource(userId: string, sourceId: string) {
  const source = await prisma.source.findFirst({ where: { id: sourceId, userId } });
  if (!source) return false;
  await prisma.source.update({ where: { id: sourceId }, data: { status: "PENDING", progress: 0, error: null } });
  await enqueueJob("source.process", { sourceId }, { userId, dedupeKey: `source:${sourceId}` });
  return true;
}

