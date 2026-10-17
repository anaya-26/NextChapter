# Kadam — a study companion for students in India

Kadam (“step”) helps school, college and competitive-exam students work out **what to learn, why it matters, which resources to use, how to practise and what to do next**. It is a responsive web app for phones and laptops. English comes first; the app shell and navigation are already translated into Hindi and Marathi, and AI explanations follow the student’s language preference.

The app is honest about what it can do. Every AI output is labelled, simulated AI is marked, demonstration data carries a “Demo data” badge, and **Settings → Integrations** shows which integrations work in your deployment.

- Feature-by-feature status: [`docs/CHECKLIST.md`](docs/CHECKLIST.md)
- [Limitations and outstanding integrations](#limitations-and-outstanding-integrations)

---

## What students can do

| Space | Highlights |
|---|---|
| **Today** | One clear next action (continue, start, plan), priorities, revisions due, flashcards due, exam countdowns, a check-in, a gentle “welcome back” after breaks, and a fresh-start plan when they’ve fallen behind. |
| **Learn** | Upload a syllabus (PDF, Word, photo or pasted text) → check and correct what was found → roadmap. Topic workspace: lessons grounded in the student’s own materials with **citations to page or timestamp**, simple/standard/deep/exam modes, notes, flashcards (spaced repetition with FSRS), practice with hints and feedback, a mistake library, revision scheduling, read-aloud. Coverage shows which topics the materials cover. Resources come from Claude web search (only URLs the search returned) or a trusted directory (NCERT, DIKSHA, NPTEL, SWAYAM and more). |
| **My Journal** | Check-ins, reflections with photos and voice notes, a study log and weekly reviews. Entries are **private by default**: the AI reads an entry only if journal access is on in Privacy *and* the student marks that entry. Messages that suggest distress get support numbers (Tele-MANAS 14416, 112) instead of coaching. |
| **Goals & Career** | Goals with milestones. Students who already know their direction get skills, projects, roles and ways in straight away. Students who are still exploring get an evidence-based **discovery review after about three months** (preliminary findings earlier), with several possibilities, the evidence and uncertainty for each, and small exploration projects. **Opportunities:** an official Indian programme directory, saved links, permitted feeds, link checks, expiry, application tracking, fit and gap analysis, interview practice. **Portfolio and CV:** achievements count only once approved with evidence, and CV tailoring stays truthful. |
| **Community** | Optional and pseudonymous. Age-appropriate spaces, questions and peer explanations, resource sharing with attribution, deliberate sharing of achievements, goals and notes, focus rooms, study buddies, and reports, blocking and moderation. |
| **My Progress** | XP for meaningful actions (counted once, with daily caps), levels, badges, an optional Kadamba growth tree and a quiet mode. Shows real improvement (study time, accuracy, recall), consistency without punishing missed streaks, and personal experiments. |
| **Calendar** | Typed or Hinglish/Marathi natural-language events (“chem test 23/10 at 10”), recurring classes, a planner that fits study into free time, reminders with quiet hours, an `.ics` export and optional **Google Calendar** sync. Every change to Google is previewed first. |
| **Companion** | Available on every page. Streamed chat that shows which data categories it used (only those the student allows). Suggestions become one-click actions. Tone runs from friendly study buddy to firm, respectful mentor. Voice input and read-aloud. |

---

## Quick start (local)

**Prerequisites:** Node.js **22.12+** and PostgreSQL **14+** (tested with 16).

```bash
# 1. Databases (development, integration tests, end-to-end tests)
sudo -u postgres psql <<'SQL'
CREATE ROLE kadam LOGIN PASSWORD 'change-me' CREATEDB;
CREATE DATABASE kadam_dev  OWNER kadam;
CREATE DATABASE kadam_test OWNER kadam;
CREATE DATABASE kadam_e2e  OWNER kadam;
SQL

# 2. Configuration
cp .env.example .env
#   Set DATABASE_URL (and TEST_/E2E_DATABASE_URL), and generate the two secrets:
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   APP_ENCRYPTION_KEY=$(openssl rand -base64 32)

# 3. Install, migrate, seed
npm install                 # also generates the Prisma client
npm run db:deploy           # applies migrations (use db:migrate while developing the schema)
npm run db:seed             # official opportunity directory + official community groups

# 4. Run
npm run dev                 # http://localhost:3000
```

**Background jobs** handle uploads, text extraction and OCR, transcription, lesson preparation, link checks, reminders, calendar sync, feeds and AI memory. With `RUN_WORKER_IN_PROCESS=true` (the default in `.env.example`) they run inside the web server, which is fine for one instance. For production, set it to `false` and run `npm run worker` as its own process. You can run several workers safely, because jobs are claimed with `FOR UPDATE SKIP LOCKED`.

**Production:** run `npm run build && npm start` (with `npm run db:deploy` on release) alongside `npm run worker`.

### Trying it without an AI key

- With `AI_PROVIDER=none`, every rule-based path works: syllabus extraction, planning, notes and flashcards, practice you write yourself, the journal, rule-based career review, gap analysis, CV and community. AI features explain that they aren’t set up.
- With `AI_PROVIDER=mock`, a deterministic test double is used, and **every output says “Simulated AI”**. It exists for automated tests and demos only.
- `ENABLE_DEMO_TOOLS=true` adds **Settings → Developer**, which can:
  - load about three months of labelled demo history, so the discovery review can be tried;
  - make you a community moderator.
- `ENABLE_TEST_CLOCK=true` adds a simulated clock for each student, for testing time-based features.
- `SEED_DEMO_ACCOUNT=true SEED_DEMO_PASSWORD=… npm run db:seed` creates a local demo student. There is no default password.

---

## Integrations

| Integration | Setting(s) | Without it |
|---|---|---|
| **Claude** (lessons with citations, extraction, practice, feedback, companion, reviews, career review, gap analysis, CV tailoring, opportunity reading, OCR via vision) | `ANTHROPIC_API_KEY`; `ANTHROPIC_MODEL` (default `claude-opus-5-5`); `AI_DAILY_REQUEST_LIMIT` per student per day | Rule-based fallbacks everywhere, clearly labelled |
| **Web search for resources** | `AI_WEB_SEARCH_ENABLED=true` (uses Claude’s server-side web search) | Trusted directory with search links, plus your own links |
| **Google sign-in and Google Calendar** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ENCRYPTION_KEY`. Enable the Google Calendar API and register both redirect URIs listed in `.env.example`. Least-privilege scopes: `calendar.app.created` (Kadam’s own “Kadam — study plan” calendar) and `calendar.freebusy` (busy times only). | Built-in calendar, planner, reminders and `.ics` export |
| **Transcription** (audio/video materials, voice notes) | `TRANSCRIPTION_API_URL`, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL` (any OpenAI-compatible `/audio/transcriptions`) | Upload `.vtt` or `.srt` captions alongside media |
| **Local OCR** | `OCR_LOCAL_ENABLED=true` (Tesseract, English) | Paste text, or correct it in the review step |
| **Opportunity feeds** | `OPPORTUNITY_FEEDS`: a JSON list of RSS, Atom or JSON feeds you’re **permitted** to use | Official directory and saved links (Kadam never scrapes) |

Uploads are stored privately under `STORAGE_DIR` and served only to their owner (`MAX_UPLOAD_MB`, `MAX_MEDIA_UPLOAD_MB`).

---

## Testing

```bash
npm run typecheck          # route types + TypeScript
npm run lint               # ESLint (zero warnings expected)
npm run test:unit          # pure logic: planner, recurrence, NL scheduling, grading, captions, safety rules, posting reader, address guard…
npm run test:integration   # services against a real Postgres (TEST_DATABASE_URL, wiped by the tests)
npm run test:e2e           # Playwright against an isolated dev server (E2E_DATABASE_URL, mock AI, test clock)
```

The end-to-end suite includes:

- **`journey.spec.ts`**: one student goes through the whole connected journey.
  - Upload a syllabus, confirm the roadmap, and open a topic whose lesson cites the student’s notes.
  - Practise, then schedule a revision into the calendar.
  - Let the AI read one reflection by choice, and check that a second reflection on the same day earns XP only once.
  - Save an opportunity and find its gaps.
  - Approve a real achievement, see the gaps shrink, build a tailored CV that includes it, and deliberately share it with the community.
- One spec per area, including a three-student community test (helpful marks, reports, blocking, moderation) and a test that the three-month discovery review works from labelled demo history.
- `mobile.spec.ts`: every main page fits a 390-px phone screen without sideways scrolling.

Integration tests cover:

- **Per-student isolation** (`isolation.test.ts`): another student can’t read or change subjects, topics, notes, cards, memories, journal entries, events, sessions, goals, conversations, opportunities, applications, achievements, CVs or files.
- Memory and privacy controls.
- Calendar permissions and preview-before-change.
- Minors’ consent and age-appropriate spaces.

Google Calendar is tested against an in-memory fake (`tests/helpers/fake-google.ts`), and network fetches against a test double. Test doubles are refused in production.

---

## Architecture

```
Browser (React 19, Next.js App Router, Tailwind)
   │  Server Components read through the data-access layer; Server Actions and Route Handlers write
   ▼
Next.js 16 server ──► src/server/services/*  (every query scoped by the signed-in student's id)
   │                     │
   │                     ├─ src/server/ai     Claude provider · labelled mock · quotas · trusted rules vs. reference data
   │                     ├─ src/server/jobs   Postgres job queue (dedupe, retries, progress) ─► worker / in-process loop
   │                     ├─ src/server/storage.ts  private files on disk, owner-only download route
   │                     └─ src/server/integrations  Google Calendar (OAuth, encrypted tokens)
   ▼
PostgreSQL (Prisma 7) — one schema, connected models from syllabus → topics → sessions → reflections → goals → applications → CV
```

- **Stack:**
  - Next.js 16 (App Router, Cache Components, Turbopack), React 19 and TypeScript.
  - Tailwind CSS with Radix primitives, Prisma 7 with PostgreSQL, and Better Auth (email/password, optional Google).
  - `@anthropic-ai/sdk`, ts-fsrs, rrule, chrono-node and next-intl.
  - Vitest and Playwright for tests.
- **Data access:**
  - Pages and actions call `requireUser()` and then services.
  - Services always filter by `userId`, and shared rows (official directory, official groups) have no owner.
  - The proxy (`src/proxy.ts`) only redirects; real authorisation sits next to each data read and write.
- **AI layer (`src/server/ai`):**
  - Fixed application rules (`CORE_RULES`) are kept separate from **retrieved content, which is wrapped and labelled as data**: uploaded materials, web pages, postings and journal text are never treated as instructions.
  - Structured outputs use Zod schemas, and lessons use Claude citations, so every claim maps to a source passage.
  - A per-student daily request cap, refusal and error handling, and an AI or Simulated AI label on every output.
  - Rule-based drafts are computed first; the AI refines them and is checked against the student’s own data. For example, a CV rewording that adds figures is rejected, and a gap marked “met” must cite a real approved achievement.
- **Background jobs:** a Postgres-backed queue with dedupe keys, so a periodic tick doesn’t pile up. The tick sends reminders, marks long-overdue sessions as missed, syncs calendars every 15 minutes, and runs opportunity upkeep every 6 hours.
- **Security:**
  - Secrets stay on the server, and OAuth tokens are encrypted at rest (AES-GCM).
  - Google OAuth uses HMAC-signed state with a nonce.
  - A strict Content-Security-Policy; uploaded files are served with `nosniff` and a sandbox CSP.
  - Outbound link checks and feeds go through a guard that allows only public addresses (DNS checked, every redirect re-checked).
  - Rate limits on auth and community posting, and account deletion that removes all data.
- **Privacy:**
  - Per-category AI permissions (profile, goals, progress, calendar, journal) and per-entry journal access.
  - Memory you can view, correct and delete; inferences are always tentative.
  - Children’s pattern inference and the community stay off until a guardian’s consent is recorded.
  - The community uses a separate pseudonymous identity, and nothing private is shared except what a student posts deliberately.
- **Design:**
  - Six spaces (Today, Learn, My Journal, Goals & Career, Community, My Progress). The calendar sits in the header, and the companion button is on every page.
  - Loading skeletons for every route, empty, error and offline states, and a Lite mode for low bandwidth.
  - Charts follow single-hue, accessible rules and include table views.

### Project layout

```
src/app/(app)/…           pages by space (today, learn, journal, goals, community, progress, calendar, companion, settings)
src/app/api/…             route handlers (auth, uploads, files, companion stream, exports, Google callback)
src/server/services/…     business logic and data access, one module per feature
src/server/ai/…           providers, prompts, mock responders
src/server/jobs/…         queue, runner, job handlers per feature
src/lib/…                 pure, unit-tested logic (planner, recurrence, NL schedule, grading, safety rules, posting reader…)
src/components/…          UI components by feature
prisma/                   schema, migrations, seed
tests/                    unit, integration, e2e
worker/index.ts           standalone background worker
```

---

## Limitations and outstanding integrations

These are stated plainly here and in the app.

- **Not exercised against live services in automated tests:**
  - Claude: tests use the labelled mock.
  - Google Calendar: tests use an in-memory fake.
  - Web link checks: tests use a test double.
  - Configure real keys to use them. Integration code follows the official APIs, and **Settings → Integrations** reports what’s live.
- **Official opportunity directory:**
  - It summarises recurring programmes from public information and isn’t a feed of live openings.
  - Dates and amounts change every cycle, so each entry sends students to the official page.
  - Links show “Not yet verified” until the background link check reaches them, which needs outbound internet.
- **No public feeds from Internshala or Unstop:** they are linked as portals and never scraped.
- **Notifications:** in-app only. Web push, email and SMS aren’t integrated; students can get reminders on their phone by exporting `.ics` or connecting Google Calendar.
- **Guardian consent:** recorded as attested by the student and guardian. Verifiable parental consent under the DPDP Act needs an identity or consent provider, which isn’t integrated.
- **Moderation:**
  - Moderators are appointed in the database; a development switch exists.
  - There’s no automated toxicity classifier. Safety relies on reports, blocking contact details, distress detection and age-separated spaces.
- **Transcription and local OCR:** transcription needs an external service, and local OCR is English-only. Claude vision handles Indian-language scans when configured.
- **Translation:** Hindi and Marathi currently cover the app shell and navigation; page content is English.
- **Storage:** uploads use local disk (`STORAGE_DIR`). Several web instances would need a shared volume or object storage, which isn’t implemented.
- **Link-check guard:** checks DNS before connecting, so a DNS-rebinding race is still possible. Deploy behind an egress proxy that blocks private ranges for defence in depth.
