import "server-only";
import { z } from "zod";

const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? fallback : ["1", "true", "yes", "on"].includes(v.trim().toLowerCase())));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const intWithDefault = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number.parseInt(v, 10) : Number.NaN;
      return Number.isFinite(n) && n > 0 ? n : fallback;
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  APP_ENCRYPTION_KEY: optionalText,
  AI_PROVIDER: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  ANTHROPIC_MODEL: optionalText,
  AI_DAILY_REQUEST_LIMIT: intWithDefault(80),
  AI_WEB_SEARCH_ENABLED: flag(true),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  TRANSCRIPTION_API_URL: optionalText,
  TRANSCRIPTION_API_KEY: optionalText,
  TRANSCRIPTION_MODEL: optionalText,
  OCR_LOCAL_ENABLED: flag(true),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: intWithDefault(25),
  MAX_MEDIA_UPLOAD_MB: intWithDefault(200),
  OPPORTUNITY_FEEDS: optionalText,
  ENABLE_TEST_CLOCK: flag(false),
  ENABLE_DEMO_TOOLS: flag(false),
});

export type Env = z.infer<typeof schema> & {
  aiProvider: "anthropic" | "mock" | "none";
  anthropicModel: string;
  googleConfigured: boolean;
  transcriptionConfigured: boolean;
  testClockEnabled: boolean;
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

let cached: Env | null = null;

/** Parsed, validated environment. Parsed lazily so builds don't require runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}. See .env.example.`);
  }
  const e = parsed.data;
  const requested = e.AI_PROVIDER?.toLowerCase();
  let aiProvider: Env["aiProvider"] = "none";
  if (requested === "mock") aiProvider = "mock";
  else if (requested === "none") aiProvider = "none";
  else if (e.ANTHROPIC_API_KEY) aiProvider = "anthropic";
  // The mock provider is a labelled test double; refuse it in production.
  if (aiProvider === "mock" && e.NODE_ENV === "production") aiProvider = "none";

  cached = {
    ...e,
    aiProvider,
    anthropicModel: e.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    googleConfigured: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    transcriptionConfigured: Boolean(e.TRANSCRIPTION_API_URL && e.TRANSCRIPTION_API_KEY),
    testClockEnabled: e.ENABLE_TEST_CLOCK && e.NODE_ENV !== "production",
  };
  return cached;
}

/** Test helper: forget the cached environment after mutating process.env. */
export function resetEnvCache() {
  cached = null;
}
