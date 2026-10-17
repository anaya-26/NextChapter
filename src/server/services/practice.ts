import "server-only";
import { z } from "zod";
import type { PracticeMode, Prisma, QuestionType } from "@/generated/prisma/client";
import { normaliseAnswer, numericMatches, orderingScore, parseNumeric, sameSet } from "@/lib/grading";
import { prisma } from "../db";
import { CORE_RULES, languageRules } from "../ai/prompts";
import { getAiProvider, withAi } from "../ai";
import { getProfile } from "./profile";
import { passagesForTopic } from "./sources";
import { awardXp } from "./xp";

export type QuestionAnswer = {
  correct?: string[];
  numeric?: number | null;
  tolerance?: number | null;
  unit?: string | null;
  acceptable?: string[];
  keyPoints?: string[];
  modelAnswer?: string | null;
};

const generatedQuestion = z.object({
  type: z.enum(["MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER", "NUMERICAL", "LONG_ANSWER", "TEACH_BACK", "ORDERING"]),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  correctOptionIds: z.array(z.string()),
  numericAnswer: z.number().nullable(),
  tolerance: z.number().nullable(),
  unit: z.string().nullable(),
  acceptableAnswers: z.array(z.string()),
  keyPoints: z.array(z.string()),
  modelAnswer: z.string().nullable(),
  explanation: z.string(),
  hints: z.array(z.string()),
  marks: z.number().int().nullable(),
  difficulty: z.enum(["INTRO", "STANDARD", "ADVANCED"]),
  sourcePassageIds: z.array(z.string()),
});

export const practiceSchema = z.object({ title: z.string(), questions: z.array(generatedQuestion) });

const MODE_GUIDE: Record<PracticeMode, string> = {
  QUICK_CHECK: "5 quick questions: mostly MCQ / TRUE_FALSE / FILL_BLANK checking core understanding, increasing in difficulty.",
  NUMERICAL: "4 NUMERICAL problems with realistic values, each with numericAnswer, tolerance (absolute) and unit; hints that guide the method without giving the answer. If the topic has no numerical aspect, use SHORT_ANSWER instead.",
  WRITTEN: "3 written questions (SHORT_ANSWER and LONG_ANSWER) in the style of board/university exams, each with marks, keyPoints a marker would look for, and a modelAnswer written in the exam-answer language.",
  TEACH_BACK: "1 TEACH_BACK question asking the student to explain the core idea in their own words to a younger student, with keyPoints that a good explanation covers.",
  EXAM: "5 exam-style questions mixing formats in the proportions an exam for this subject would use, with marks; only follow an exam pattern if assessment details are given.",
  MIXED: "6 questions mixing MCQ, NUMERICAL (if relevant), FILL_BLANK and SHORT_ANSWER.",
};

export async function generatePracticeSet(userId: string, topicId: string, mode: PracticeMode) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId }, include: { syllabus: { include: { subject: true } } } });
  if (!topic) throw new Error("Topic not found");
  const profile = await getProfile(userId);
  const passages = await passagesForTopic(userId, topicId, 6);
  const assessment = ((topic.syllabus.assessment as { label: string; detail: string }[] | null) ?? []).map((a) => `${a.label}: ${a.detail}`).join("; ");
  const ai = getAiProvider();
  const result = await withAi(userId, "practice_generate", (p) =>
    p.generateObject({
      feature: "practice_generate",
      userId,
      system: `${CORE_RULES}\n\n${languageRules(profile)}\n\n## Task: write practice questions\nWrite original practice questions (never copy exam papers). Match formats to the subject and assessment. For choice questions give 4 options with short ids (a–d). Fill in only the fields relevant to each type (empty arrays / null otherwise). Hints go from gentle nudge to near-solution, never the answer itself. sourcePassageIds: ids of passages a question is based on.`,
      task: `Subject: ${topic.syllabus.subject.name}. Topic: ${topic.title}.\nObjectives: ${topic.objectives.join("; ") || "not stated"}.\nStudent: ${profile.educationStage ?? "unknown stage"}${profile.examTargets.length ? `, preparing for ${profile.examTargets.join(", ")}` : ""}.\nAssessment stated in syllabus: ${assessment || "none"}.\n${MODE_GUIDE[mode]}`,
      references: passages.map((x) => ({ id: x.id, title: x.sourceTitle, text: x.text, location: x.page ? `page ${x.page}` : undefined })),
      schema: practiceSchema,
      effort: "medium",
    }),
  );
  const generatedBy = ai?.name === "mock" ? "MOCK" : "AI";
  return prisma.practiceSet.create({
    data: {
      userId,
      topicId,
      title: result.data.title || `${topic.title} — practice`,
      mode,
      generatedBy,
      model: result.model,
      questions: {
        create: result.data.questions.slice(0, 10).map((q, i) => ({
          userId,
          topicId,
          type: q.type,
          prompt: q.prompt,
          options: q.options.length ? q.options : undefined,
          answer: {
            correct: q.correctOptionIds,
            numeric: q.numericAnswer,
            tolerance: q.tolerance,
            unit: q.unit,
            acceptable: q.acceptableAnswers,
            keyPoints: q.keyPoints,
            modelAnswer: q.modelAnswer,
          } satisfies QuestionAnswer as Prisma.InputJsonValue,
          explanation: q.explanation,
          hints: q.hints.slice(0, 3),
          marks: q.marks,
          difficulty: q.difficulty,
          order: i,
          generatedBy,
          sourceRefs: q.sourcePassageIds.filter((id) => passages.some((p) => p.id === id)),
        })),
      },
    },
    include: { questions: true },
  });
}

/** A question written by the student (works without AI). */
export async function createOwnQuestion(
  userId: string,
  topicId: string,
  input: { type: "SHORT_ANSWER" | "MCQ" | "NUMERICAL"; prompt: string; answer: string; options?: string[]; explanation?: string | null },
) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, userId } });
  if (!topic) throw new Error("Topic not found");
  let set = await prisma.practiceSet.findFirst({ where: { userId, topicId, generatedBy: "STUDENT" } });
  set ??= await prisma.practiceSet.create({ data: { userId, topicId, title: "My own questions", mode: "MIXED", generatedBy: "STUDENT" } });
  const options = input.type === "MCQ" ? (input.options ?? []).filter(Boolean).map((text, i) => ({ id: String.fromCharCode(97 + i), text })) : undefined;
  const answer: QuestionAnswer =
    input.type === "MCQ"
      ? { correct: options?.filter((o) => normaliseAnswer(o.text) === normaliseAnswer(input.answer)).map((o) => o.id) ?? [] }
      : input.type === "NUMERICAL"
        ? { numeric: parseNumeric(input.answer) }
        : { acceptable: [input.answer], keyPoints: [input.answer] };
  return prisma.question.create({
    data: {
      userId,
      topicId,
      practiceSetId: set.id,
      type: input.type,
      prompt: input.prompt,
      options,
      answer: answer as Prisma.InputJsonValue,
      explanation: input.explanation ?? null,
      hints: [],
      generatedBy: "STUDENT",
      order: await prisma.question.count({ where: { practiceSetId: set.id } }),
    },
  });
}

const feedbackSchema = z.object({
  score: z.number(),
  verdict: z.enum(["CORRECT", "PARTLY_CORRECT", "INCORRECT"]),
  coveredPoints: z.array(z.string()),
  missingPoints: z.array(z.string()),
  misconceptions: z.array(z.string()),
  feedback: z.string(),
  nextStep: z.string(),
});

export type AttemptInput = {
  selected?: string[];
  text?: string;
  order?: string[];
  /** Self-assessment: key points the student says they covered (no-AI mode). */
  selfCovered?: string[];
  hintsUsed?: number;
  confidence?: number;
  timeSpentSec?: number;
};

export type GradeResult = {
  attemptId: string;
  isCorrect: boolean | null;
  score: number | null;
  feedback: string | null;
  feedbackBy: "RULES" | "AI" | "MOCK" | "STUDENT" | null;
  needsSelfAssessment: boolean;
  misconceptions: string[];
};

/** Grades deterministically where possible; uses AI feedback (labelled) for open answers, else self-assessment. */
export async function gradeAttempt(userId: string, questionId: string, input: AttemptInput, at: Date): Promise<GradeResult> {
  const q = await prisma.question.findFirst({ where: { id: questionId, userId }, include: { topic: { include: { syllabus: { include: { subject: true } } } } } });
  if (!q) throw new Error("Question not found");
  const answer = (q.answer ?? {}) as QuestionAnswer;
  let isCorrect: boolean | null = null;
  let score: number | null = null;
  let feedback: string | null = null;
  let feedbackBy: GradeResult["feedbackBy"] = null;
  let misconceptions: string[] = [];
  let needsSelfAssessment = false;

  const type: QuestionType = q.type;
  if (type === "MCQ" || type === "MULTI_SELECT" || type === "TRUE_FALSE") {
    isCorrect = sameSet(input.selected ?? [], answer.correct ?? []);
    score = isCorrect ? 1 : 0;
    feedbackBy = "RULES";
  } else if (type === "NUMERICAL") {
    const given = parseNumeric(input.text ?? "");
    isCorrect = given !== null && answer.numeric != null && numericMatches(given, answer.numeric, answer.tolerance);
    score = isCorrect ? 1 : 0;
    feedbackBy = "RULES";
    if (!isCorrect && given !== null && answer.numeric != null) {
      const ratio = given / answer.numeric;
      if ([10, 100, 1000, 0.1, 0.01, 0.001].some((r) => Math.abs(ratio - r) < r * 0.02)) {
        feedback = "Your answer is off by a power of ten — check unit conversions.";
      } else if (Math.abs(given + answer.numeric) < Math.abs(answer.numeric) * 0.01) {
        feedback = "Right size, wrong sign — check the direction or sign convention.";
      }
    }
  } else if (type === "ORDERING") {
    score = orderingScore(input.order ?? [], answer.correct ?? []);
    isCorrect = score === 1;
    feedbackBy = "RULES";
  } else if ((type === "FILL_BLANK" || type === "SHORT_ANSWER") && (answer.acceptable ?? []).some((a) => normaliseAnswer(a) === normaliseAnswer(input.text ?? ""))) {
    isCorrect = true;
    score = 1;
    feedbackBy = "RULES";
  } else if (input.selfCovered) {
    const total = answer.keyPoints?.length || 1;
    score = Math.min(1, input.selfCovered.length / total);
    isCorrect = score >= 0.7;
    feedbackBy = "STUDENT";
    feedback = "Self-assessed against the key points.";
  } else if (getAiProvider() && (input.text ?? "").trim()) {
    const profile = await getProfile(userId);
    const ai = getAiProvider()!;
    const r = await withAi(userId, "answer_feedback", (p) =>
      p.generateObject({
        feature: "answer_feedback",
        userId,
        system: `${CORE_RULES}\n\n${languageRules(profile)}\n\n## Task: give feedback on a student's answer\nJudge the reasoning, not just keywords. Score 0–1 against the key points. Name specific misconceptions. Be encouraging and concrete. This is AI feedback, not an official mark.`,
        task: `Question (${type}${q.marks ? `, ${q.marks} marks` : ""}): ${q.prompt}\nKey points: ${(answer.keyPoints ?? []).join("; ") || "use your judgement"}\nModel answer: ${answer.modelAnswer ?? "not given"}`,
        references: [{ id: "student-answer", title: "Student's answer", text: input.text ?? "" }],
        schema: feedbackSchema,
        effort: "low",
      }),
    );
    score = Math.max(0, Math.min(1, r.data.score));
    isCorrect = r.data.verdict === "CORRECT";
    misconceptions = r.data.misconceptions;
    feedback = [r.data.feedback, r.data.missingPoints.length ? `Missing: ${r.data.missingPoints.join("; ")}.` : "", r.data.nextStep ? `Next: ${r.data.nextStep}` : ""].filter(Boolean).join("\n\n");
    feedbackBy = ai.name === "mock" ? "MOCK" : "AI";
  } else {
    needsSelfAssessment = true;
  }

  const attempt = await prisma.practiceAttempt.create({
    data: {
      userId,
      questionId,
      topicId: q.topicId,
      response: input as Prisma.InputJsonValue,
      isCorrect,
      score,
      feedback,
      feedbackBy,
      hintsUsed: input.hintsUsed ?? 0,
      confidence: input.confidence ?? null,
      timeSpentSec: input.timeSpentSec ?? null,
      attemptedAt: at,
    },
  });
  if (!needsSelfAssessment) {
    await awardXp(userId, { action: "PRACTICE_ATTEMPT", dedupeKey: `attempt:${questionId}`, reason: "Answered a practice question", sourceType: "Question", sourceId: questionId, at });
  }
  // Answering a question linked to an open mistake correctly moves it towards resolved.
  if (isCorrect) {
    const open = await prisma.mistake.findMany({ where: { userId, questionId, status: { not: "RESOLVED" } } });
    for (const m of open) {
      await prisma.mistake.update({ where: { id: m.id }, data: { status: "RESOLVED", resolvedAt: at } });
      await awardXp(userId, { action: "MISTAKE_REVIEW", points: 10, dedupeKey: `mistake-resolved:${m.id}`, reason: "Resolved a mistake", sourceType: "Mistake", sourceId: m.id, at });
    }
  }
  return { attemptId: attempt.id, isCorrect, score, feedback, feedbackBy, needsSelfAssessment, misconceptions };
}

/** Records the student's self-assessment for an open answer (no-AI mode). */
export async function selfAssess(userId: string, attemptId: string, covered: string[], at: Date) {
  const attempt = await prisma.practiceAttempt.findFirst({ where: { id: attemptId, userId }, include: { question: true } });
  if (!attempt) throw new Error("Attempt not found");
  const keyPoints = ((attempt.question.answer ?? {}) as QuestionAnswer).keyPoints ?? [];
  const score = keyPoints.length ? Math.min(1, covered.length / keyPoints.length) : covered.length ? 1 : 0;
  await prisma.practiceAttempt.update({
    where: { id: attemptId },
    data: { score, isCorrect: score >= 0.7, feedbackBy: "STUDENT", feedback: "Self-assessed against the key points.", response: { ...(attempt.response as object), selfCovered: covered } },
  });
  await awardXp(userId, { action: "PRACTICE_ATTEMPT", dedupeKey: `attempt:${attempt.questionId}`, reason: "Answered a practice question", sourceType: "Question", sourceId: attempt.questionId, at });
  return { score };
}

/**
 * Understanding check: a practice set with ≥3 answered questions and ≥70% average
 * marks the topic "understanding checked" (once). Students may always move on regardless.
 */
export async function evaluateUnderstanding(userId: string, practiceSetId: string, at: Date) {
  const set = await prisma.practiceSet.findFirst({ where: { id: practiceSetId, userId }, include: { questions: { include: { attempts: { orderBy: { attemptedAt: "desc" }, take: 1 } } } } });
  if (!set) return null;
  const latest = set.questions.map((q) => q.attempts[0]).filter((a) => a && a.score !== null);
  const average = latest.length ? latest.reduce((s, a) => s + (a!.score ?? 0), 0) / latest.length : 0;
  const passed = latest.length >= 3 && average >= 0.7;
  if (passed) {
    const topic = await prisma.topic.findUniqueOrThrow({ where: { id: set.topicId } });
    if (!topic.understandingCheckedAt) {
      await prisma.topic.update({ where: { id: topic.id }, data: { understandingCheckedAt: at } });
    }
    await awardXp(userId, { action: "UNDERSTANDING_CHECK", dedupeKey: `understanding:${set.topicId}`, reason: `Understanding checked: ${topic.title}`, sourceType: "Topic", sourceId: topic.id, at });
  }
  return { answered: latest.length, total: set.questions.length, average, passed };
}

export async function practiceSetsForTopic(userId: string, topicId: string) {
  return prisma.practiceSet.findMany({
    where: { userId, topicId },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { order: "asc" }, include: { attempts: { orderBy: { attemptedAt: "desc" }, take: 1 } } } },
  });
}
