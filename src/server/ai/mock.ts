import "server-only";
import { mockResponders } from "./mock-responders";
import {
  AiOutputError,
  type AiProvider,
  type CitedAnswer,
  type CitedRequest,
  type StructuredRequest,
  type TextRequest,
  type Usage,
  type WebSearchRequest,
  type WebSearchResult,
} from "./types";

export const MOCK_MODEL = "mock-test-double";

const estimate = (s: string): number => Math.ceil(s.length / 4);

/**
 * Deterministic AI test double used only when AI_PROVIDER=mock (automated tests and
 * demos). Every output is labelled "Simulated AI" in the interface. Refused in production.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = MOCK_MODEL;

  async generateObject<T>(req: StructuredRequest<T>) {
    const responder = mockResponders[req.feature];
    if (!responder) throw new AiOutputError(`No mock responder for ${req.feature}`);
    const raw = await responder(req as StructuredRequest<unknown>);
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new AiOutputError(`Mock output for ${req.feature} failed validation: ${parsed.error.message}`);
    return { data: parsed.data, usage: this.usage(req.task, JSON.stringify(raw)), model: this.model };
  }

  async generateText(req: TextRequest) {
    const text = mockChatReply(req);
    return { text, usage: this.usage(JSON.stringify(req.messages), text), model: this.model };
  }

  async *streamText(req: TextRequest) {
    const text = mockChatReply(req);
    for (const piece of text.match(/\S+\s*/g) ?? []) {
      yield piece;
      await new Promise((r) => setTimeout(r, 4));
    }
    return { text, usage: this.usage(JSON.stringify(req.messages), text), model: this.model };
  }

  async answerWithCitations(req: CitedRequest): Promise<CitedAnswer> {
    const segments: CitedAnswer["segments"] = [
      { text: `## Simulated explanation\n\nThis is a simulated, source-linked explanation generated for testing. `, passageIds: [], citedTexts: [] },
    ];
    for (const p of req.passages.slice(0, 3)) {
      const sentence = p.text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) ?? p.text.slice(0, 220);
      segments.push({ text: `Your material says: "${sentence.trim()}"`, passageIds: [p.id], citedTexts: [sentence] });
      segments.push({ text: "\n\n", passageIds: [], citedTexts: [] });
    }
    if (!req.passages.length) {
      segments.push({ text: "No uploaded passages matched this topic.", passageIds: [], citedTexts: [] });
    }
    const text = segments.map((s) => s.text).join("");
    return { segments, usage: this.usage(req.task, text), model: this.model };
  }

  async searchWeb(req: WebSearchRequest): Promise<WebSearchResult> {
    const responder = mockResponders.resource_search_web;
    const findings = responder ? ((await responder(req as never)) as WebSearchResult["findings"]) : [];
    return { summary: "Simulated search results.", findings, usage: this.usage(req.task, ""), model: this.model };
  }

  private usage(input: string, output: string): Usage {
    return { inputTokens: estimate(input), outputTokens: estimate(output) };
  }
}

function mockChatReply(req: TextRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const responder = mockResponders.companion_chat_text;
  if (responder) {
    const out = responder(req as never);
    if (typeof out === "string") return out;
  }
  return `(Simulated AI) You asked: "${last.slice(0, 160)}". Here is a suggested next step: review the topic summary, then try three practice questions.`;
}
