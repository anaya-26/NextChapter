import "server-only";
import { z } from "zod";
import type { ExtractionMethod, Prisma, SourceKind, TopicKind } from "@/generated/prisma/client";
import { estimateMinutes, parseSyllabusText, type ParsedSyllabus } from "@/lib/syllabus/rules";
import { prisma } from "../db";
import { CORE_RULES } from "../ai/prompts";
import { describeAiError, getAiProvider, withAi, type Attachment, type ReferenceDoc } from "../ai";
import { enqueueJob, PermanentJobError } from "../jobs/queue";
import { readFileBuffer, saveFile, uploadLimitBytes } from "../storage";
import { detectKind, extractFromFile, NeedsSetupError } from "./extraction";
import { getProfile } from "./profile";
import { awardXp } from "./xp";

/* ── Schemas ─────────────────────────────────────────────────────────── */

export const extractionSchema = z.object({
  title: z.string().nullable(),
  units: z.array(
    z.object({
      title: z.string(),
      uncertain: z.boolean(),
      excerpt: z.string().nullable(),
      topics: z.array(
        z.object({
          title: z.string(),
          uncertain: z.boolean(),
          excerpt: z.string().nullable(),
          statedObjectives: z.array(z.string()),
        }),
      ),
    }),
  ),
  assessment: z.array(z.object({ label: z.string(), detail: z.string(), excerpt: z.string().nullable(), uncertain: z.boolean() })),
  unreadable: z.array(z.object({ location: z.string(), description: z.string() })),
  warnings: z.array(z.string()),
});

export const enrichmentSchema = z.object({
  topics: z.array(
    z.object({
      topicId: z.string(),
      objectives: z.array(z.string()),
      estimatedMinutes: z.number().int(),
      prerequisiteTopicIds: z.array(z.string()),
      prerequisiteReason: z.string().nullable(),
    }),
  ),
  suggestedOrder: z.array(z.string()),
  background: z.array(
    z.object({ title: z.string(), why: z.string(), supportsTopicIds: z.array(z.string()), estimatedMinutes: z.number().int() }),
  ),
  optional: z.array(z.object({ title: z.string(), why: z.string(), relatedTopicIds: z.array(z.string()), estimatedMinutes: z.number().int() })),
});

export type AssessmentItem = { label: string; detail: string; excerpt: string | null; uncertain: boolean };

/* ── Creation ────────────────────────────────────────────────────────── */

export type IncomingFile = { fileName: string; mime: string; data: Buffer };

export async function createSyllabus(
  userId: string,
  input: { subjectId: string; title: string; files: IncomingFile[]; pastedText?: string | null; language?: string | null },
) {
  const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, userId } });
  if (!subject) throw new Error("Subject not found");
  if (!input.files.length && !input.pastedText?.trim()) throw new Error("Add a file or paste the syllabus text");

  const prepared: { kind: SourceKind; file: IncomingFile }[] = [];
  for (const f of input.files) {
    const kind = detectKind(f.fileName, f.mime);
    if (!kind || !["PDF", "DOCUMENT", "TEXT", "IMAGE"].includes(kind)) {
      throw new Error(`“${f.fileName}” isn't a supported syllabus format (photo, screenshot, PDF, Word document or text).`);
    }
    if (f.data.length > uploadLimitBytes("document")) throw new Error(`“${f.fileName}” is larger than the upload limit.`);
    prepared.push({ kind, file: f });
  }

  const syllabus = await prisma.syllabus.create({
    data: { userId, subjectId: subject.id, title: input.title || `${subject.name} syllabus`, status: "EXTRACTING" },
  });

  const sources = [...prepared];
  if (input.pastedText?.trim()) {
    sources.push({
      kind: "TEXT",
      file: { fileName: "pasted-syllabus.txt", mime: "text/plain", data: Buffer.from(input.pastedText.trim(), "utf8") },
    });
  }
  for (const { kind, file } of sources) {
    const stored = await saveFile({ userId, purpose: "SOURCE", fileName: file.fileName, mimeType: file.mime, data: file.data });
    await prisma.source.create({
      data: {
        userId,
        subjectId: subject.id,
        syllabusId: syllabus.id,
        role: "SYLLABUS",
        kind,
        origin: file.fileName === "pasted-syllabus.txt" ? "PASTE" : "UPLOAD",
        title: file.fileName === "pasted-syllabus.txt" ? "Pasted syllabus text" : file.fileName,
        fileKey: stored.key,
        fileName: file.fileName,
        mimeType: file.mime,
        sizeBytes: file.data.length,
        language: input.language ?? null,
      },
    });
  }
  const job = await enqueueJob("syllabus.extract", { syllabusId: syllabus.id }, { userId, dedupeKey: `syllabus-extract:${syllabus.id}` });
  return { syllabus, jobId: job.id };
}

/* ── Extraction job ──────────────────────────────────────────────────── */

const EXTRACT_SYSTEM = `${CORE_RULES}

## Task: read a syllabus
Extract the syllabus structure exactly as written: units (or modules/chapters) and the topics inside them.
- Do not add topics that aren't in the document, and don't reword topics beyond fixing obvious OCR errors.
- Mark a unit or topic "uncertain" when text is partly unreadable, when you had to guess its grouping, or when you corrected OCR.
- Put a short verbatim excerpt of the source line in "excerpt".
- statedObjectives: only objectives/learning outcomes the syllabus explicitly states for that topic; otherwise an empty list.
- assessment: only explicitly stated details (marks, weightage, exam duration, internal/external split, practicals). Never infer or assume a pattern.
- unreadable: describe anything you couldn't read (e.g. "bottom of page 2 is cut off").
- warnings: anything the student should double-check.`;

export async function runSyllabusExtraction(syllabusId: string, progress: (pct: number, message?: string) => Promise<void>) {
  const syllabus = await prisma.syllabus.findUnique({ where: { id: syllabusId }, include: { sources: true } });
  if (!syllabus) throw new PermanentJobError("Syllabus no longer exists");
  const userId = syllabus.userId;
  const ai = getAiProvider();
  const vision = ai?.name === "anthropic";

  const references: ReferenceDoc[] = [];
  const attachments: Attachment[] = [];
  const warnings: string[] = [];
  let usedOcr = false;
  let minConfidence: number | undefined;

  for (const [i, source] of syllabus.sources.entries()) {
    await progress(10 + (i / Math.max(1, syllabus.sources.length)) * 50, `Reading ${source.title}`);
    await prisma.source.update({ where: { id: source.id }, data: { status: "PROCESSING", progress: 30 } });
    const data = await readFileBuffer(source.fileKey!);
    try {
      if (vision && source.kind === "IMAGE") {
        attachments.push({ kind: "image", mediaType: source.mimeType ?? "image/png", base64: data.toString("base64"), name: source.title });
        await prisma.source.update({ where: { id: source.id }, data: { status: "READY", progress: 100, extractionMethod: "ai-vision" } });
        continue;
      }
      const extracted = await extractFromFile({ kind: source.kind, data, fileName: source.fileName ?? source.title, mime: source.mimeType ?? "", language: source.language });
      const scanned = extracted.warnings.some((w) => w.includes("looks scanned"));
      if (vision && source.kind === "PDF" && scanned) {
        attachments.push({ kind: "pdf", mediaType: "application/pdf", base64: data.toString("base64"), name: source.title });
      } else {
        warnings.push(...extracted.warnings.map((w) => `${source.title}: ${w}`));
      }
      if (extracted.method === "local-ocr") {
        usedOcr = true;
        minConfidence = Math.min(minConfidence ?? 100, extracted.confidence ?? 100);
      }
      const text = extracted.passages.map((p) => p.text).join("\n\n");
      if (text.trim()) references.push({ id: source.id, title: source.title, text });
      await prisma.source.update({
        where: { id: source.id },
        data: { status: "READY", progress: 100, extractionMethod: extracted.method, textLength: text.length, pageCount: extracted.pageCount ?? null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this file";
      await prisma.source.update({
        where: { id: source.id },
        data: { status: error instanceof NeedsSetupError ? "NEEDS_SETUP" : "FAILED", error: message, progress: 100 },
      });
      warnings.push(`${source.title}: ${message}`);
    }
  }

  const rawText = references.map((r) => `--- ${r.title} ---\n${r.text}`).join("\n\n");
  let parsed: ParsedSyllabus | null = null;
  let method: ExtractionMethod = usedOcr ? "OCR_RULES" : "RULES";

  if (ai && (references.length || attachments.length)) {
    await progress(65, ai.name === "mock" ? "Structuring (simulated AI)" : "Structuring with AI");
    try {
      const profile = await getProfile(userId);
      const result = await withAi(userId, "syllabus_extract", (p) =>
        p.generateObject({
          feature: "syllabus_extract",
          userId,
          system: EXTRACT_SYSTEM,
          task: `Extract the structure of this syllabus${profile.boardOrUniversity ? ` (board/university: ${profile.boardOrUniversity})` : ""}. The source files are provided above${attachments.length ? " as images/documents" : ""}.`,
          references,
          attachments,
          schema: extractionSchema,
          effort: "medium",
        }),
      );
      parsed = result.data;
      method = ai.name === "mock" ? "MOCK" : "AI";
    } catch (error) {
      warnings.push(`AI extraction unavailable (${describeAiError(error)}) — used rule-based extraction instead.`);
    }
  }
  if (!parsed) {
    if (!rawText.trim()) {
      await prisma.syllabus.update({
        where: { id: syllabusId },
        data: { status: "NEEDS_REVIEW", rawText: null, extractionMethod: "MANUAL", extractionNotes: [...warnings, "No text could be read. Add units and topics manually or paste the text."] },
      });
      return { units: 0 };
    }
    // Parse the sources' own text (without our file separators, which would read as a title).
    parsed = parseSyllabusText(references.map((r) => r.text).join("\n\n"), { ocrConfidence: minConfidence });
  }

  await progress(85, "Saving draft roadmap");
  await saveExtractedDraft(syllabusId, userId, parsed, method, rawText, warnings);
  return { units: parsed.units.length };
}

async function saveExtractedDraft(
  syllabusId: string,
  userId: string,
  parsed: ParsedSyllabus,
  method: ExtractionMethod,
  rawText: string,
  extraWarnings: string[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.topic.deleteMany({ where: { syllabusId } });
    await tx.syllabusUnit.deleteMany({ where: { syllabusId } });
    let order = 0;
    for (const [ui, unit] of parsed.units.entries()) {
      const u = await tx.syllabusUnit.create({
        data: { syllabusId, title: unit.title.slice(0, 200), order: ui, uncertain: unit.uncertain, sourceExcerpt: unit.excerpt },
      });
      for (const t of unit.topics) {
        await tx.topic.create({
          data: {
            userId,
            syllabusId,
            unitId: u.id,
            title: t.title.slice(0, 200),
            order: order++,
            uncertain: t.uncertain,
            sourceExcerpt: t.excerpt,
            objectives: t.statedObjectives,
            objectivesSource: t.statedObjectives.length ? "SYLLABUS" : null,
          },
        });
      }
    }
    await tx.syllabus.update({
      where: { id: syllabusId },
      data: {
        status: "NEEDS_REVIEW",
        rawText: rawText || null,
        extractionMethod: method,
        title: parsed.title?.slice(0, 160) || undefined,
        assessment: parsed.assessment as Prisma.InputJsonValue,
        extractionNotes: [...extraWarnings, ...parsed.warnings, ...parsed.unreadable.map((u) => `Unreadable (${u.location}): ${u.description}`)],
      },
    });
  });
}

/* ── Review & confirmation ───────────────────────────────────────────── */

export const outlineSchema = z.object({
  title: z.string().trim().min(1).max(160),
  units: z
    .array(
      z.object({
        id: z.string().nullable(),
        title: z.string().trim().min(1, "Every unit needs a title").max(200),
        topics: z.array(
          z.object({
            id: z.string().nullable(),
            title: z.string().trim().min(1, "Every topic needs a title").max(200),
            kind: z.enum(["REQUIRED", "BACKGROUND", "OPTIONAL"]),
            uncertain: z.boolean(),
          }),
        ),
      }),
    )
    .max(60),
  assessment: z
    .array(z.object({ label: z.string().trim().max(120), detail: z.string().trim().max(400), excerpt: z.string().nullable(), uncertain: z.boolean() }))
    .max(40),
});

export type Outline = z.infer<typeof outlineSchema>;

export async function getSyllabus(userId: string, syllabusId: string) {
  return prisma.syllabus.findFirst({
    where: { id: syllabusId, userId },
    include: {
      subject: true,
      sources: { orderBy: { createdAt: "asc" } },
      units: { orderBy: { order: "asc" }, include: { topics: { orderBy: { order: "asc" } } } },
      topics: { where: { unitId: null }, orderBy: { order: "asc" } },
    },
  });
}

/** Replaces the draft outline with the student's corrected version, keeping existing topic ids. */
export async function saveOutline(userId: string, syllabusId: string, outline: Outline) {
  const syllabus = await prisma.syllabus.findFirst({ where: { id: syllabusId, userId }, include: { topics: { select: { id: true } }, units: { select: { id: true } } } });
  if (!syllabus) throw new Error("Syllabus not found");
  const ownTopicIds = new Set(syllabus.topics.map((t) => t.id));
  const ownUnitIds = new Set(syllabus.units.map((u) => u.id));
  await prisma.$transaction(async (tx) => {
    const keepTopics = new Set<string>();
    const keepUnits = new Set<string>();
    let order = 0;
    for (const [ui, unit] of outline.units.entries()) {
      let unitId: string;
      if (unit.id && ownUnitIds.has(unit.id)) {
        await tx.syllabusUnit.update({ where: { id: unit.id }, data: { title: unit.title, order: ui, uncertain: false } });
        unitId = unit.id;
      } else {
        unitId = (await tx.syllabusUnit.create({ data: { syllabusId, title: unit.title, order: ui } })).id;
      }
      keepUnits.add(unitId);
      for (const t of unit.topics) {
        if (t.id && ownTopicIds.has(t.id)) {
          await tx.topic.update({ where: { id: t.id }, data: { title: t.title, kind: t.kind, uncertain: t.uncertain, unitId, order: order++ } });
          keepTopics.add(t.id);
        } else {
          const created = await tx.topic.create({
            data: { userId, syllabusId, unitId, title: t.title, kind: t.kind, uncertain: t.uncertain, order: order++, origin: "STUDENT" },
          });
          keepTopics.add(created.id);
        }
      }
    }
    await tx.topic.deleteMany({ where: { syllabusId, id: { notIn: [...keepTopics] } } });
    await tx.syllabusUnit.deleteMany({ where: { syllabusId, id: { notIn: [...keepUnits] } } });
    await tx.syllabus.update({
      where: { id: syllabusId },
      data: { title: outline.title, assessment: outline.assessment.filter((a) => a.label || a.detail) as Prisma.InputJsonValue },
    });
  });
}

export async function confirmSyllabus(userId: string, syllabusId: string, at: Date) {
  const syllabus = await prisma.syllabus.findFirst({ where: { id: syllabusId, userId }, include: { _count: { select: { topics: true } } } });
  if (!syllabus) throw new Error("Syllabus not found");
  if (syllabus._count.topics === 0) throw new Error("Add at least one topic before confirming");
  await prisma.syllabus.update({
    where: { id: syllabusId },
    data: { status: "CONFIRMED", confirmedAt: at, version: syllabus.status === "CONFIRMED" ? syllabus.version + 1 : syllabus.version },
  });
  await prisma.topic.updateMany({ where: { syllabusId }, data: { uncertain: false } });
  await awardXp(userId, { action: "SYLLABUS_CONFIRMED", dedupeKey: `syllabus:${syllabusId}`, reason: "Confirmed a syllabus", sourceType: "Syllabus", sourceId: syllabusId, at });
  await enqueueJob("roadmap.enrich", { syllabusId }, { userId, dedupeKey: `roadmap-enrich:${syllabusId}` });
}

/* ── Roadmap enrichment ─────────────────────────────────────────────── */

const ENRICH_SYSTEM = `${CORE_RULES}

## Task: build a learning roadmap from a confirmed syllabus
For each topic, write 2–4 concise, checkable learning objectives, estimate study minutes for a first pass at this student's level (excluding practice and revision), and list prerequisite topics from the same syllabus (by id) with a one-line reason.
Suggest a study order (all topic ids). Keep the syllabus's own order unless prerequisites clearly require otherwise.
"background": foundation topics NOT in the syllabus that this student likely needs to revisit first (only where genuinely needed; at most 5).
"optional": at most 3 interesting topics beyond the syllabus for exploration.
Never present background or optional topics as syllabus requirements.`;

export async function runRoadmapEnrichment(syllabusId: string, progress: (pct: number, message?: string) => Promise<void>) {
  const syllabus = await prisma.syllabus.findUnique({
    where: { id: syllabusId },
    include: { units: { orderBy: { order: "asc" } }, topics: { orderBy: { order: "asc" } }, subject: true },
  });
  if (!syllabus) throw new PermanentJobError("Syllabus no longer exists");
  const userId = syllabus.userId;
  const required = syllabus.topics.filter((t) => t.kind === "REQUIRED" || t.origin === "SYLLABUS" || t.origin === "STUDENT");
  const ai = getAiProvider();
  await progress(20, "Planning your roadmap");

  let enrichment: z.infer<typeof enrichmentSchema> | null = null;
  let source: "AI" | "MOCK" | "RULES" = "RULES";
  if (ai) {
    try {
      const profile = await getProfile(userId);
      const unitTitle = (id: string | null) => syllabus.units.find((u) => u.id === id)?.title ?? "";
      const listing = required.map((t) => `${t.id} | ${unitTitle(t.unitId)} | ${t.title}`).join("\n");
      const result = await withAi(userId, "roadmap_enrich", (p) =>
        p.generateObject({
          feature: "roadmap_enrich",
          userId,
          system: ENRICH_SYSTEM,
          task: `Subject: ${syllabus.subject.name}. Student: ${profile.educationStage ?? "unknown stage"}${profile.course ? `, ${profile.course}` : ""}${
            profile.examTargets.length ? `, preparing for ${profile.examTargets.join(", ")}` : ""
          }.\nTopics (id | unit | title):\n${listing}`,
          schema: enrichmentSchema,
          effort: "medium",
        }),
      );
      enrichment = result.data;
      source = ai.name === "mock" ? "MOCK" : "AI";
    } catch {
      enrichment = null;
    }
  }
  await progress(70, "Saving roadmap");
  await applyEnrichment(syllabusId, userId, enrichment, source);
}

export async function applyEnrichment(
  syllabusId: string,
  userId: string,
  enrichment: z.infer<typeof enrichmentSchema> | null,
  source: "AI" | "MOCK" | "RULES",
) {
  const topics = await prisma.topic.findMany({ where: { syllabusId }, orderBy: { order: "asc" } });
  const ids = new Set(topics.map((t) => t.id));

  await prisma.$transaction(async (tx) => {
    if (!enrichment) {
      // Rule-based fallback: generic objectives, heuristic effort, sequence within each unit.
      for (const [i, t] of topics.entries()) {
        const prev = topics[i - 1];
        await tx.topic.update({
          where: { id: t.id },
          data: {
            estimatedMinutes: t.estimatedMinutes ?? estimateMinutes(t.title),
            ...(t.objectives.length
              ? {}
              : { objectives: [`Explain the key ideas of ${t.title} in your own words`, `Solve standard questions on ${t.title}`], objectivesSource: "RULES" }),
          },
        });
        if (prev && prev.unitId === t.unitId) {
          await tx.topicPrerequisite.upsert({
            where: { topicId_prerequisiteId: { topicId: t.id, prerequisiteId: prev.id } },
            create: { topicId: t.id, prerequisiteId: prev.id, reason: "Comes earlier in the same unit" },
            update: {},
          });
        }
      }
      await tx.topic.updateMany({ where: { syllabusId }, data: { prerequisitesSource: "RULES" } });
      return;
    }

    for (const e of enrichment.topics) {
      if (!ids.has(e.topicId)) continue;
      const t = topics.find((x) => x.id === e.topicId)!;
      await tx.topic.update({
        where: { id: t.id },
        data: {
          estimatedMinutes: Math.max(10, Math.min(600, e.estimatedMinutes)),
          ...(t.objectivesSource === "SYLLABUS" ? {} : { objectives: e.objectives.slice(0, 5), objectivesSource: source }),
          prerequisitesSource: source,
        },
      });
      for (const pid of e.prerequisiteTopicIds) {
        if (!ids.has(pid) || pid === t.id) continue;
        await tx.topicPrerequisite.upsert({
          where: { topicId_prerequisiteId: { topicId: t.id, prerequisiteId: pid } },
          create: { topicId: t.id, prerequisiteId: pid, reason: e.prerequisiteReason },
          update: { reason: e.prerequisiteReason },
        });
      }
    }
    // Suggested sequence: listed ids first, then anything the model omitted, in original order.
    const sequence = [...enrichment.suggestedOrder.filter((id) => ids.has(id)), ...topics.map((t) => t.id)];
    const seen = new Set<string>();
    let order = 0;
    const orderMap = new Map<string, number>();
    for (const id of sequence) {
      if (seen.has(id)) continue;
      seen.add(id);
      orderMap.set(id, (order += 10));
    }
    for (const [id, o] of orderMap) await tx.topic.update({ where: { id }, data: { order: o } });

    const origin = source === "MOCK" ? "MOCK" : "AI";
    for (const b of enrichment.background.slice(0, 5)) {
      const supports = b.supportsTopicIds.filter((id) => ids.has(id));
      const firstSupported = Math.min(...supports.map((id) => orderMap.get(id) ?? 1000), 1000);
      const unitId = topics.find((t) => t.id === supports[0])?.unitId ?? null;
      const created = await tx.topic.create({
        data: {
          userId,
          syllabusId,
          unitId,
          title: b.title.slice(0, 200),
          description: b.why,
          kind: "BACKGROUND",
          origin,
          order: firstSupported - 5,
          estimatedMinutes: b.estimatedMinutes,
          objectivesSource: source,
        },
      });
      for (const sid of supports) {
        await tx.topicPrerequisite.create({ data: { topicId: sid, prerequisiteId: created.id, reason: b.why } });
      }
    }
    for (const o of enrichment.optional.slice(0, 3)) {
      const related = o.relatedTopicIds.find((id) => ids.has(id));
      await tx.topic.create({
        data: {
          userId,
          syllabusId,
          unitId: topics.find((t) => t.id === related)?.unitId ?? null,
          title: o.title.slice(0, 200),
          description: o.why,
          kind: "OPTIONAL",
          origin,
          order: (order += 10),
          estimatedMinutes: o.estimatedMinutes,
          objectivesSource: source,
        },
      });
    }
  });
}

/* ── Roadmap queries & topic actions ────────────────────────────────── */

export async function getRoadmap(userId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return null;
  const syllabi = await prisma.syllabus.findMany({
    where: { subjectId, userId },
    orderBy: { createdAt: "desc" },
    include: {
      units: { orderBy: { order: "asc" } },
      topics: {
        orderBy: { order: "asc" },
        include: {
          prerequisites: { include: { prerequisite: { select: { id: true, title: true, status: true, kind: true } } } },
          _count: { select: { lessons: true, attempts: true, flashcards: true } },
        },
      },
    },
  });
  return { subject, syllabi };
}

export async function getOwnedTopic(userId: string, topicId: string) {
  return prisma.topic.findFirst({ where: { id: topicId, userId } });
}

export async function setTopicFamiliar(userId: string, topicId: string, familiar: boolean) {
  const res = await prisma.topic.updateMany({
    where: { id: topicId, userId },
    data: familiar ? { isFamiliar: true, status: "SKIPPED", skippedReason: "Already familiar" } : { isFamiliar: false, status: "NOT_STARTED", skippedReason: null },
  });
  return res.count === 1;
}

export async function moveTopic(userId: string, topicId: string, direction: "up" | "down") {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId } });
  if (!topic) return false;
  const siblings = await prisma.topic.findMany({ where: { syllabusId: topic.syllabusId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  const idx = siblings.findIndex((s) => s.id === topicId);
  const swapWith = siblings[direction === "up" ? idx - 1 : idx + 1];
  if (!swapWith) return false;
  // Re-number to make swaps unambiguous even when orders collide.
  const reordered = [...siblings];
  [reordered[idx], reordered[direction === "up" ? idx - 1 : idx + 1]] = [reordered[direction === "up" ? idx - 1 : idx + 1], reordered[idx]];
  await prisma.$transaction(reordered.map((s, i) => prisma.topic.update({ where: { id: s.id }, data: { order: (i + 1) * 10 } })));
  return true;
}

export async function setTopicKind(userId: string, topicId: string, kind: TopicKind) {
  const res = await prisma.topic.updateMany({ where: { id: topicId, userId }, data: { kind } });
  return res.count === 1;
}

export async function addRoadmapTopic(userId: string, syllabusId: string, input: { title: string; kind: TopicKind; unitId: string | null }) {
  const syllabus = await prisma.syllabus.findFirst({ where: { id: syllabusId, userId } });
  if (!syllabus) return null;
  const max = await prisma.topic.aggregate({ where: { syllabusId }, _max: { order: true } });
  return prisma.topic.create({
    data: {
      userId,
      syllabusId,
      unitId: input.unitId,
      title: input.title,
      kind: input.kind,
      origin: "STUDENT",
      order: (max._max.order ?? 0) + 10,
      estimatedMinutes: estimateMinutes(input.title),
    },
  });
}

export async function deleteTopic(userId: string, topicId: string) {
  const res = await prisma.topic.deleteMany({ where: { id: topicId, userId } });
  return res.count === 1;
}

/** Progress summary: studied, understanding checked and revised are tracked separately. */
export function summariseTopics(
  topics: { kind: string; status: string; studiedAt: Date | null; understandingCheckedAt: Date | null; lastRevisedAt: Date | null; estimatedMinutes: number | null }[],
) {
  const required = topics.filter((t) => t.kind === "REQUIRED");
  const active = required.filter((t) => t.status !== "SKIPPED");
  const studied = active.filter((t) => t.studiedAt || t.status === "STUDIED").length;
  const checked = active.filter((t) => t.understandingCheckedAt).length;
  const revised = active.filter((t) => t.lastRevisedAt).length;
  const remainingMinutes = active.filter((t) => !t.studiedAt).reduce((s, t) => s + (t.estimatedMinutes ?? 60), 0);
  return {
    total: required.length,
    skipped: required.length - active.length,
    studied,
    checked,
    revised,
    remainingMinutes,
    percent: active.length ? Math.round((studied / active.length) * 100) : 0,
  };
}
