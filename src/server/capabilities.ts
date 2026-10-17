import "server-only";
import { aiStatus } from "./ai";
import { env } from "./env";
import { workerStatus } from "./jobs/runner";

export type CapabilityState = "ready" | "limited" | "simulated" | "not_configured" | "not_available";

export type Capability = {
  id: string;
  name: string;
  state: CapabilityState;
  summary: string;
  /** What works without this integration. */
  fallback?: string;
  /** How to enable it. */
  setup?: string;
};

/** Single source of truth for what actually works in this deployment. */
export async function getCapabilities(): Promise<Capability[]> {
  const e = env();
  const ai = aiStatus();
  const worker = await workerStatus();
  const inProcessWorker = process.env.RUN_WORKER_IN_PROCESS === "true";

  const aiState: CapabilityState = ai.simulated ? "simulated" : ai.configured ? "ready" : "not_configured";

  return [
    {
      id: "ai",
      name: "AI companion & generated study material (Claude)",
      state: aiState,
      summary: ai.simulated
        ? "Using a deterministic test double. Every AI output is labelled “Simulated AI” and is not real AI."
        : ai.configured
          ? `Claude model ${ai.model}, with source citations and refusal fallbacks.`
          : "No AI key is configured.",
      fallback:
        "Rule-based syllabus extraction, manual notes and flashcards, spaced revision, practice you write yourself, planning and journalling all work without AI.",
      setup: "Set ANTHROPIC_API_KEY in .env (optionally ANTHROPIC_MODEL, default claude-opus-5-5) and restart.",
    },
    {
      id: "web_search",
      name: "Resource discovery on the web",
      state: ai.webSearch ? (ai.simulated ? "simulated" : "ready") : ai.configured ? "limited" : "not_configured",
      summary: ai.webSearch
        ? "Claude web search finds readings, videos and open resources; only URLs returned by the search are shown, with a link check."
        : "Web search is off.",
      fallback: "A directory of trusted open and Indian education providers (NCERT, NPTEL, SWAYAM, DIKSHA, Khan Academy, OpenStax and more) with search links, plus links you add.",
      setup: "Requires AI; set AI_WEB_SEARCH_ENABLED=true.",
    },
    {
      id: "ocr",
      name: "Reading photos and screenshots (OCR)",
      state: ai.configured && !ai.simulated ? "ready" : e.OCR_LOCAL_ENABLED ? "limited" : "not_configured",
      summary:
        ai.configured && !ai.simulated
          ? "Claude vision reads syllabus photos, screenshots and scanned PDFs."
          : e.OCR_LOCAL_ENABLED
            ? "Local Tesseract OCR (English) — slower and less accurate on handwriting and complex layouts."
            : "No OCR available.",
      fallback: "Paste the text, or type it into the correction step.",
      setup: "Set ANTHROPIC_API_KEY for the best results; OCR_LOCAL_ENABLED=true enables local OCR.",
    },
    {
      id: "transcription",
      name: "Audio & video transcription",
      state: e.transcriptionConfigured ? "ready" : "limited",
      summary: e.transcriptionConfigured
        ? `Whisper-compatible service at ${new URL(e.TRANSCRIPTION_API_URL!).host} with segment timestamps.`
        : "No transcription service configured.",
      fallback: "Upload a caption file (.vtt or .srt) with your audio/video to get timestamped, searchable transcripts.",
      setup: "Set TRANSCRIPTION_API_URL, TRANSCRIPTION_API_KEY and TRANSCRIPTION_MODEL.",
    },
    {
      id: "google_signin",
      name: "Sign in with Google",
      state: e.googleConfigured ? "ready" : "not_configured",
      summary: e.googleConfigured ? "Available on the sign-in page." : "Email and password sign-in only.",
      setup: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and register the redirect URIs listed in .env.example.",
    },
    {
      id: "google_calendar",
      name: "Google Calendar sync",
      state: e.googleConfigured && e.APP_ENCRYPTION_KEY ? "ready" : "not_configured",
      summary:
        e.googleConfigured && e.APP_ENCRYPTION_KEY
          ? "Connect from Calendar. Uses least-privilege scopes; every change is previewed before it is applied."
          : "Not configured.",
      fallback: "The built-in calendar, planner and reminders work fully without Google.",
      setup: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_ENCRYPTION_KEY; enable the Google Calendar API.",
    },
    {
      id: "opportunity_feeds",
      name: "Live opportunity feeds",
      state: e.OPPORTUNITY_FEEDS ? "ready" : "limited",
      summary: e.OPPORTUNITY_FEEDS
        ? "Permitted RSS/Atom/JSON feeds are refreshed in the background."
        : "No live feeds configured. Internshala and Unstop do not offer public feeds, so they are not scraped.",
      fallback: "A checked directory of official Indian programmes and portals, plus opportunity links you save yourself.",
      setup: "Set OPPORTUNITY_FEEDS to a JSON list of feeds you are permitted to use.",
    },
    {
      id: "worker",
      name: "Background processing",
      state: worker.alive ? "ready" : inProcessWorker ? "limited" : "not_available",
      summary: worker.alive
        ? `Worker active (last heartbeat ${worker.lastSeenAt?.toISOString()}).`
        : inProcessWorker
          ? "Running inside the web server process (fine for one instance)."
          : "No worker heartbeat — uploads and syncs will wait in the queue.",
      setup: "Run `npm run worker`, or set RUN_WORKER_IN_PROCESS=true.",
    },
    {
      id: "notifications",
      name: "Reminders & notifications",
      state: "limited",
      summary: "In-app reminders for events, revisions and planned sessions, exam/deadline countdowns (7, 3 and 1 days), quiet hours 10:30 pm–6:30 am, and your chosen frequency. Needs the background worker.",
      fallback: "Phone push, email and SMS aren't integrated; export the calendar (.ics) or connect Google Calendar to get reminders from your phone's calendar app.",
      setup: "Planned: web push (VAPID keys) and an email provider.",
    },
    {
      id: "voice",
      name: "Voice input and read-aloud",
      state: "limited",
      summary: "Uses the browser's built-in speech features where available (Chrome/Edge support is best).",
      fallback: "Typing always works. Voice journal recordings are stored privately; transcription needs a transcription service.",
    },
  ];
}
