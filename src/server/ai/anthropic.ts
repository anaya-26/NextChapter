import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { referenceBlock } from "./prompts";
import {
  AiOutputError,
  AiRefusalError,
  type AiProvider,
  type Attachment,
  type ChatTurn,
  type CitedAnswer,
  type CitedRequest,
  type ReferenceDoc,
  type StructuredRequest,
  type TextRequest,
  type Usage,
  type WebFinding,
  type WebSearchRequest,
  type WebSearchResult,
} from "./types";

type BetaContent = Anthropic.Beta.BetaContentBlockParam;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;

/**
 * Server-side refusal fallbacks: if a safety classifier declines a request, the API re-runs
 * it on Anthropic's recommended fallback model inside the same call.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function usageOf(msg: { usage: { input_tokens: number; output_tokens: number } }): Usage {
  return { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
}

function ensureNotRefused(msg: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) {
  if (msg.stop_reason === "refusal") throw new AiRefusalError(msg.stop_details?.category ?? null);
}

function attachmentBlock(a: Attachment): BetaContent {
  if (a.kind === "pdf") {
    return {
      type: "document",
      title: a.name,
      source: { type: "base64", media_type: "application/pdf", data: a.base64 },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: a.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
      data: a.base64,
    },
  };
}

function userContent(task: string, references?: ReferenceDoc[], attachments?: Attachment[]): BetaContent[] {
  const blocks: BetaContent[] = [];
  for (const a of attachments ?? []) blocks.push(attachmentBlock(a));
  const refs = referenceBlock(references ?? []);
  if (refs) blocks.push({ type: "text", text: refs });
  blocks.push({ type: "text", text: task });
  return blocks;
}

function chatMessages(turns: ChatTurn[], references?: ReferenceDoc[]): BetaMessageParam[] {
  const msgs: BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const refs = referenceBlock(references ?? []);
  if (refs && msgs.length) {
    // Attach references to the latest user turn so the earlier (cached) prefix stays stable.
    const last = msgs[msgs.length - 1];
    if (last.role === "user") {
      msgs[msgs.length - 1] = {
        role: "user",
        content: [
          { type: "text", text: refs },
          { type: "text", text: typeof last.content === "string" ? last.content : "" },
        ],
      };
    }
  }
  return msgs;
}

function formatLocation(p: { page?: number | null; startSec?: number | null; endSec?: number | null }) {
  if (p.page) return ` (page ${p.page})`;
  if (p.startSec != null) {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    return ` (${mmss(p.startSec)}${p.endSec != null ? `–${mmss(p.endSec)}` : ""})`;
  }
  return "";
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  private system(text: string): Anthropic.Beta.BetaTextBlockParam[] {
    return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
  }

  async generateObject<T>(req: StructuredRequest<T>) {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: this.system(req.system),
      messages: [{ role: "user", content: userContent(req.task, req.references, req.attachments) }],
      output_config: { format: zodOutputFormat(req.schema as never), effort: req.effort ?? "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    ensureNotRefused(res);
    if (res.stop_reason === "max_tokens") throw new AiOutputError("Structured response was truncated");
    if (res.parsed_output == null) throw new AiOutputError("Structured response could not be parsed");
    return { data: res.parsed_output as T, usage: usageOf(res), model: res.model };
  }

  async generateText(req: TextRequest) {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 32000,
      system: this.system(req.system),
      messages: chatMessages(req.messages, req.references),
      output_config: { effort: req.effort ?? "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    const msg = await stream.finalMessage();
    ensureNotRefused(msg);
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, usage: usageOf(msg), model: msg.model };
  }

  async *streamText(req: TextRequest) {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: this.system(req.system),
      messages: chatMessages(req.messages, req.references),
      output_config: { effort: req.effort ?? "low" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        yield event.delta.text;
      }
    }
    const msg = await stream.finalMessage();
    ensureNotRefused(msg);
    return { text, usage: usageOf(msg), model: msg.model };
  }

  /** Grounded answer where every claim can cite an individual passage (page / timestamp). */
  async answerWithCitations(req: CitedRequest): Promise<CitedAnswer> {
    const content: BetaContent[] = req.passages.map((p) => ({
      type: "search_result",
      source: `passage:${p.id}`,
      title: `${p.sourceTitle}${formatLocation(p)}`,
      content: [{ type: "text", text: p.text }],
      citations: { enabled: true },
    }));
    content.push({ type: "text", text: req.task });
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 32000,
      system: this.system(req.system),
      messages: [{ role: "user", content }],
      output_config: { effort: req.effort ?? "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    const msg = await stream.finalMessage();
    ensureNotRefused(msg);
    const segments = msg.content.flatMap((b) => {
      if (b.type !== "text") return [];
      const cites = (b.citations ?? []).flatMap((c) =>
        c.type === "search_result_location" ? [{ id: c.source.replace(/^passage:/, ""), text: c.cited_text }] : [],
      );
      return [{ text: b.text, passageIds: cites.map((c) => c.id), citedTexts: cites.map((c) => c.text) }];
    });
    return { segments, usage: usageOf(msg), model: msg.model };
  }

  /** Web search via Claude's server-side tool. Only URLs the search actually returned are reported. */
  async searchWeb(req: WebSearchRequest): Promise<WebSearchResult> {
    const messages: BetaMessageParam[] = [{ role: "user", content: req.task }];
    const found = new Map<string, WebFinding>();
    const summary: string[] = [];
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let model = this.model;
    for (let turn = 0; turn < 4; turn++) {
      const msg = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: this.system(req.system),
        messages,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: req.maxSearches ?? 5,
            ...(req.allowedDomains?.length ? { allowed_domains: req.allowedDomains } : {}),
            user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata" },
          },
        ],
        output_config: { effort: req.effort ?? "medium" },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
      ensureNotRefused(msg);
      model = msg.model;
      usage.inputTokens += msg.usage.input_tokens;
      usage.outputTokens += msg.usage.output_tokens;
      for (const block of msg.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.type === "web_search_result" && !found.has(r.url)) found.set(r.url, { url: r.url, title: r.title });
          }
        }
        if (block.type === "text") {
          summary.push(block.text);
          for (const c of block.citations ?? []) {
            if (c.type === "web_search_result_location") {
              const prev = found.get(c.url);
              found.set(c.url, { url: c.url, title: c.title ?? prev?.title ?? c.url, citedText: c.cited_text });
            }
          }
        }
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content as BetaContent[] });
    }
    return { summary: summary.join(""), findings: [...found.values()], usage, model };
  }
}
