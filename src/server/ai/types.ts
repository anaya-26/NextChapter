import type { z } from "zod";

export type AiFeature =
  | "syllabus_extract"
  | "lesson"
  | "practice_generate"
  | "answer_feedback"
  | "flashcards_generate"
  | "coverage_match"
  | "roadmap_enrich"
  | "companion_chat"
  | "memory_extract"
  | "journal_suggestions"
  | "weekly_review"
  | "nl_schedule"
  | "restart_plan"
  | "experiment_suggest"
  | "career_review"
  | "gap_analysis"
  | "resource_search"
  | "interview_feedback"
  | "cv_tailor"
  | "note_draft";

export type Effort = "low" | "medium" | "high";

/** Untrusted retrieved content. Always wrapped and labelled as data, never instructions. */
export type ReferenceDoc = {
  id: string;
  title: string;
  text: string;
  /** e.g. "page 4" or "12:30–14:05" */
  location?: string;
};

export type Attachment = {
  kind: "image" | "pdf";
  mediaType: string;
  base64: string;
  name: string;
};

export type Usage = { inputTokens: number; outputTokens: number };

type Base = {
  feature: AiFeature;
  userId: string;
  /** Trusted application instructions. */
  system: string;
  effort?: Effort;
  maxTokens?: number;
};

export type StructuredRequest<T> = Base & {
  /** What to do (trusted). */
  task: string;
  references?: ReferenceDoc[];
  attachments?: Attachment[];
  schema: z.ZodType<T>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type TextRequest = Base & {
  messages: ChatTurn[];
  references?: ReferenceDoc[];
};

/** Passage-level grounding: each passage can be cited individually. */
export type Passage = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  text: string;
  page?: number | null;
  startSec?: number | null;
  endSec?: number | null;
};

export type CitedRequest = Base & {
  task: string;
  passages: Passage[];
};

export type CitedSegment = { text: string; passageIds: string[]; citedTexts: string[] };

export type CitedAnswer = { segments: CitedSegment[]; usage: Usage; model: string };

export type WebSearchRequest = Base & {
  task: string;
  allowedDomains?: string[];
  maxSearches?: number;
};

export type WebFinding = { url: string; title: string; citedText?: string };

export type WebSearchResult = { summary: string; findings: WebFinding[]; usage: Usage; model: string };

export interface AiProvider {
  readonly name: "anthropic" | "mock";
  readonly model: string;
  generateObject<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: Usage; model: string }>;
  generateText(req: TextRequest): Promise<{ text: string; usage: Usage; model: string }>;
  streamText(req: TextRequest): AsyncGenerator<string, { text: string; usage: Usage; model: string }>;
  answerWithCitations(req: CitedRequest): Promise<CitedAnswer>;
  searchWeb(req: WebSearchRequest): Promise<WebSearchResult>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI is not configured. Set ANTHROPIC_API_KEY (see Settings → Integrations).");
    this.name = "AiNotConfiguredError";
  }
}

export class AiQuotaError extends Error {
  constructor(limit: number) {
    super(`Daily AI limit reached (${limit} requests). It resets at midnight.`);
    this.name = "AiQuotaError";
  }
}

export class AiRefusalError extends Error {
  constructor(public category: string | null) {
    super("The AI declined this request. Try rephrasing, or continue without AI.");
    this.name = "AiRefusalError";
  }
}

export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** Friendly, non-technical message for any AI failure. */
export function describeAiError(error: unknown): string {
  if (error instanceof AiNotConfiguredError || error instanceof AiQuotaError || error instanceof AiRefusalError) {
    return error.message;
  }
  if (error instanceof AiOutputError) return "The AI response was incomplete. Please try again.";
  return "The AI service is unavailable right now. Your work is saved; try again shortly.";
}
