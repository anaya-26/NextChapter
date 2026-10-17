import "server-only";
import type { Groundedness, LessonMode, Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { CORE_RULES, languageRules } from "../ai/prompts";
import { getAiProvider, withAi, type CitedSegment } from "../ai";
import { enqueueJob, PermanentJobError } from "../jobs/queue";
import { getProfile } from "./profile";
import { passagesForTopic, type FoundPassage } from "./sources";

export type LessonCitation = {
  n: number;
  passageId: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  citedText: string;
};

export type LessonContent = { markdown: string };

export const LESSON_MODES: { value: LessonMode; label: string; description: string }[] = [
  { value: "SIMPLE", label: "Simpler", description: "Plain words and everyday examples" },
  { value: "STANDARD", label: "Standard", description: "Clear explanation with worked examples" },
  { value: "DEEP", label: "Deeper", description: "Intuition, derivations and connections" },
  { value: "EXAM", label: "Exam-focused", description: "What's examined, answer structure, model answer" },
];

const MODE_RULES: Record<LessonMode, string> = {
  SIMPLE: "Mode SIMPLE: plain words, short sentences, an everyday example from Indian life, one fully worked example.",
  STANDARD: "Mode STANDARD: clear explanation, one or two worked examples step by step, common mistakes, a short summary.",
  DEEP: "Mode DEEP: build intuition and connections, include derivations or reasoning where relevant, edge cases, and how it links to related topics.",
  EXAM: "Mode EXAM: what is examinable (use only the assessment details given — never invent marks or patterns), how to structure an answer, marking keywords, one model answer, and mistakes examiners commonly penalise.",
};

function lessonSystem(explanationLanguage: string, examAnswerLanguage: string) {
  return `${CORE_RULES}

${languageRules({ explanationLanguage, examAnswerLanguage })}

## Task: teach one syllabus topic
Write a lesson using markdown headings (##). Use LaTeX for maths ($…$ inline, $$…$$ display).
Ground factual statements in the provided passages where possible. When you add something that is not in the student's materials, mark it with "(beyond your materials)".
If (and only if) a diagram would genuinely help and you are confident it is accurate, include one simple Mermaid flowchart in a \`\`\`mermaid block.
End with "## Check yourself" listing three short questions without answers.`;
}

function lessonTask(topic: { title: string; objectives: string[] }, mode: LessonMode, ctx: { subject: string; stage: string | null; assessment: string | null }) {
  return [
    `Subject: ${ctx.subject}. Topic: ${topic.title}.`,
    ctx.stage ? `Student level: ${ctx.stage}.` : "",
    topic.objectives.length ? `Learning objectives:\n- ${topic.objectives.join("\n- ")}` : "",
    ctx.assessment ? `Assessment details stated in the syllabus: ${ctx.assessment}` : "No assessment details were stated in the syllabus.",
    MODE_RULES[mode],
  ]
    .filter(Boolean)
    .join("\n");
}

/** Turns cited segments into markdown with [[n]] markers and a numbered citation list. */
export function buildCitedMarkdown(segments: CitedSegment[], passages: FoundPassage[]) {
  const numbers = new Map<string, number>();
  const citations: LessonCitation[] = [];
  let markdown = "";
  let citedChars = 0;
  let totalChars = 0;
  for (const seg of segments) {
    totalChars += seg.text.trim().length;
    const marks: number[] = [];
    seg.passageIds.forEach((pid, i) => {
      const p = passages.find((x) => x.id === pid);
      if (!p) return;
      if (!numbers.has(pid)) {
        numbers.set(pid, numbers.size + 1);
        citations.push({
          n: numbers.get(pid)!,
          passageId: pid,
          sourceId: p.sourceId,
          sourceTitle: p.sourceTitle,
          sourceKind: p.sourceKind,
          page: p.page,
          startSec: p.startSec,
          endSec: p.endSec,
          citedText: (seg.citedTexts[i] ?? p.text).slice(0, 600),
        });
      }
      marks.push(numbers.get(pid)!);
    });
    if (marks.length) {
      citedChars += seg.text.trim().length;
      const tag = [...new Set(marks)].map((n) => ` [[${n}]]`).join("");
      markdown += seg.text.replace(/(\s*)$/, `${tag}$1`);
    } else {
      markdown += seg.text;
    }
  }
  const ratio = totalChars ? citedChars / totalChars : 0;
  const groundedness: Groundedness = ratio >= 0.4 ? "GROUNDED" : ratio > 0 ? "PARTIAL" : "GENERAL_KNOWLEDGE";
  return { markdown, citations, groundedness };
}

export async function requestLesson(userId: string, topicId: string, mode: LessonMode) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId } });
  if (!topic) throw new Error("Topic not found");
  if (!getAiProvider()) return null;
  return enqueueJob("lesson.generate", { topicId, mode }, { userId, dedupeKey: `lesson:${topicId}:${mode}` });
}

export async function generateLesson(topicId: string, mode: LessonMode, progress: (pct: number, message?: string) => Promise<void>) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { syllabus: { include: { subject: true } } } });
  if (!topic) throw new PermanentJobError("Topic no longer exists");
  const userId = topic.userId;
  const profile = await getProfile(userId);
  await progress(15, "Finding relevant passages in your materials");
  const passages = await passagesForTopic(userId, topicId, 8);
  const assessment = ((topic.syllabus.assessment as { label: string; detail: string }[] | null) ?? []).map((a) => `${a.label}: ${a.detail}`).join("; ") || null;
  const system = lessonSystem(profile.explanationLanguage, profile.examAnswerLanguage);
  const task = lessonTask(topic, mode, { subject: topic.syllabus.subject.name, stage: [profile.educationStage, profile.course].filter(Boolean).join(", ") || null, assessment });

  await progress(35, "Writing your lesson");
  let markdown: string;
  let citations: LessonCitation[] = [];
  let groundedness: Groundedness;
  let model: string;
  const warnings: string[] = [];
  const ai = getAiProvider();

  if (passages.length) {
    const result = await withAi(userId, "lesson", (p) =>
      p.answerWithCitations({
        feature: "lesson",
        userId,
        system,
        task,
        passages: passages.map((x) => ({ id: x.id, sourceId: x.sourceId, sourceTitle: x.sourceTitle, text: x.text, page: x.page, startSec: x.startSec, endSec: x.endSec })),
        effort: mode === "DEEP" ? "high" : "medium",
      }),
    );
    ({ markdown, citations, groundedness } = buildCitedMarkdown(result.segments, passages));
    model = result.model;
    if (groundedness !== "GROUNDED") warnings.push("Parts of this lesson go beyond your uploaded materials — check them against your textbook or the resources below.");
  } else {
    const result = await withAi(userId, "lesson", (p) =>
      p.generateText({
        feature: "lesson",
        userId,
        system,
        messages: [{ role: "user", content: `${task}\n\nThe student hasn't uploaded materials that cover this topic, so write from general knowledge and say so at the start.` }],
        effort: mode === "DEEP" ? "high" : "medium",
      }),
    );
    markdown = result.text;
    groundedness = "GENERAL_KNOWLEDGE";
    model = result.model;
    warnings.push("Not based on your materials (none matched this topic). Verify it with your textbook or the suggested resources.");
  }
  await progress(90, "Saving");
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      topicId,
      mode,
      language: profile.explanationLanguage,
      content: { markdown } satisfies LessonContent as Prisma.InputJsonValue,
      citations: citations as unknown as Prisma.InputJsonValue,
      sourceIds: [...new Set(citations.map((c) => c.sourceId))],
      groundedness,
      warnings,
      generatedBy: ai?.name === "mock" ? "MOCK" : "AI",
      model,
    },
  });
  if (topic.status === "NOT_STARTED") await prisma.topic.update({ where: { id: topicId }, data: { status: "IN_PROGRESS" } });
  return { lessonId: lesson.id };
}

export async function latestLessons(userId: string, topicId: string) {
  const lessons = await prisma.lesson.findMany({ where: { userId, topicId }, orderBy: { createdAt: "desc" } });
  const byMode = new Map<LessonMode, (typeof lessons)[number]>();
  for (const l of lessons) if (!byMode.has(l.mode)) byMode.set(l.mode, l);
  return byMode;
}
