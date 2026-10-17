import "server-only";
import { prisma } from "../db";
import { env } from "../env";
import { dateOnly, localDateKey } from "@/lib/time";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { AiNotConfiguredError, AiQuotaError, type AiFeature, type AiProvider, type Usage } from "./types";
import "./mock-registry";

export * from "./types";

let provider: AiProvider | null | undefined;

export function getAiProvider(): AiProvider | null {
  if (provider !== undefined) return provider;
  const e = env();
  if (e.aiProvider === "anthropic") provider = new AnthropicProvider(e.ANTHROPIC_API_KEY!, e.anthropicModel);
  else if (e.aiProvider === "mock") provider = new MockProvider();
  else provider = null;
  return provider;
}

export function resetAiProvider() {
  provider = undefined;
}

export type AiStatus = {
  configured: boolean;
  provider: "anthropic" | "mock" | "none";
  model: string | null;
  simulated: boolean;
  webSearch: boolean;
};

export function aiStatus(): AiStatus {
  const e = env();
  const p = getAiProvider();
  return {
    configured: !!p,
    provider: e.aiProvider,
    model: p?.model ?? null,
    simulated: p?.name === "mock",
    webSearch: !!p && e.AI_WEB_SEARCH_ENABLED,
  };
}

function today() {
  return dateOnly(localDateKey(new Date()));
}

export async function aiRequestsToday(userId: string): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({ where: { userId, day: today() }, _sum: { requests: true } });
  return agg._sum.requests ?? 0;
}

async function recordUsage(userId: string, feature: AiFeature, usage?: Usage) {
  const day = today();
  await prisma.aiUsage.upsert({
    where: { userId_day_feature: { userId, day, feature } },
    create: { userId, day, feature, requests: 1, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    update: {
      requests: { increment: 1 },
      inputTokens: { increment: usage?.inputTokens ?? 0 },
      outputTokens: { increment: usage?.outputTokens ?? 0 },
    },
  });
}

/**
 * Run an AI call with configuration and quota checks, recording usage afterwards.
 * Throws AiNotConfiguredError / AiQuotaError so callers can show a clear limitation.
 */
export async function withAi<T extends { usage?: Usage }>(
  userId: string,
  feature: AiFeature,
  run: (ai: AiProvider) => Promise<T>,
): Promise<T> {
  const ai = getAiProvider();
  if (!ai) throw new AiNotConfiguredError();
  const limit = env().AI_DAILY_REQUEST_LIMIT;
  if ((await aiRequestsToday(userId)) >= limit) throw new AiQuotaError(limit);
  const result = await run(ai);
  await recordUsage(userId, feature, result.usage);
  return result;
}

/** Streaming variant: quota is checked up front; usage recorded by the caller via `finish`. */
export async function startAiStream(userId: string, feature: AiFeature) {
  const ai = getAiProvider();
  if (!ai) throw new AiNotConfiguredError();
  const limit = env().AI_DAILY_REQUEST_LIMIT;
  if ((await aiRequestsToday(userId)) >= limit) throw new AiQuotaError(limit);
  return { ai, finish: (usage?: Usage) => recordUsage(userId, feature, usage) };
}
