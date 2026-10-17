# Kadam — module checklist

Legend: ✅ done and tested · 🟡 partial / works with limitations · ⏳ planned in a later stage · 🔌 needs an external credential to go live

Last updated: Stage 12 (verification, docs and delivery). Everything listed is built; 🟡 and 🔌 items say exactly what is limited or needs a credential.

## Foundation
- ✅ Next.js 16.4 App Router (Cache Components + Partial Prefetching), TypeScript, Tailwind v4 design tokens (light/dark, Lite mode)
- ✅ PostgreSQL + Prisma 7.10 connected data model for every module (`prisma/schema.prisma`)
- ✅ Auth (Better Auth email/password; 🔌 Google sign-in when `GOOGLE_CLIENT_ID/SECRET` set), proxy redirects + server-side data access layer
- ✅ Per-student data isolation (every query scoped by `userId`; integration tests)
- ✅ Private file storage with ownership-checked downloads
- ✅ Postgres job queue + worker (`npm run worker`) or in-process worker; progress/error reporting
- ✅ Capability registry → Settings › Integrations shows exactly what works
- ✅ AI layer: Claude (`claude-opus-5-5`) structured outputs, citations, web search, refusal fallbacks, quotas; labelled mock for tests
- ✅ Test clock (per student, dev/test only) and labelled demo history
- 🟡 Localisation: English complete; Hindi/Marathi for navigation, auth, landing and Today strings (rest falls back to English)

## 2. Student profile & personalisation
- ✅ Progressive six-step onboarding, editable in Settings
- ✅ Education stage, board/university, course, year, qualifications, exams, subjects, skills, interests, ambitions, domains, languages, time
- ✅ Commitments (classes, coaching, commute, responsibilities)
- ✅ Clear vs exploring career direction
- ✅ Memory: view / confirm / correct / delete; tentative inferences; journal-derived memories removed on revocation
- ✅ Permission-aware AI context with "what was used" list
- ✅ Repeated missed sessions (same time of day) → tentative pattern (only if inference is allowed) → obstacle discussion → plan adjusted (move, shorten or keep); the student’s answer becomes an editable memory

## 3. Syllabus upload & roadmap
- ✅ Photos/screenshots (Claude vision, or 🟡 offline Tesseract OCR en/hi/mr), PDFs (text + scanned detection), DOCX, pasted text
- ✅ Units/topics/stated assessment extraction (AI, mock, or rule-based) with uncertain/unreadable highlighting
- ✅ Correction & confirmation step (rename, reorder, move, add, delete, kinds, assessment edits) with originals side by side
- ✅ Full roadmap: objectives, prerequisites, suggested sequence, effort, progress (studied / understanding checked / revised tracked separately)
- ✅ Reorder, skip familiar topics, revisit foundations, required vs background vs optional (labelled AI/simulated/student)
- ✅ Detailed material is generated when a topic is opened (not before)

## 4. Topic learning workspace
- ✅ Uploads: PDF, DOCX, PPTX, text, images, audio, video, captions (.vtt/.srt) with progress bar, size limits, per-file errors, retry and delete; pasted text
- ✅ Recordings: captions paired by file name become a timestamped transcript; 🔌 automatic transcription with a Whisper-compatible service (`TRANSCRIPTION_API_*`)
- 🟡 Images: Claude vision when AI is configured, else offline OCR (`OCR_LOCAL_ENABLED`)
- ✅ Originals stay available (owner-only streaming with byte ranges, download); source viewer opens at the cited page or timestamp and seeks the player
- ✅ Lessons in four modes (simpler, standard, deeper, exam-focused) with numbered citations to passages, pages and timestamps; groundedness label; "beyond your materials" warnings; Markdown, LaTeX maths, Mermaid diagrams (click-to-load in Lite mode)
- ✅ Without AI: "What your materials say" passages, objectives, notes, own questions, flashcards, revision and the resource directory still work
- ✅ Editable Markdown notes (preview, download), AI drafts labelled until edited
- ✅ Flashcards: own cards, cards from notes (flagged when the note changes later), cards from mistakes, FSRS spaced review with interval previews and keyboard shortcuts, Anki-compatible export
- ✅ Practice: quick check, numericals (tolerance, power-of-ten and sign hints), written answers with key points, teach-back, exam-style; hints; generated practice and AI feedback labelled; self-assessment when AI is off; write-your-own questions
- ✅ Understanding check (≥3 answers, ≥70%) awards a badge once and never blocks the roadmap
- ✅ Mistake library linked to questions and explanations; later correct answers resolve mistakes; recurring difficulties highlighted
- ✅ Spaced revision scheduled into the calendar (student's time zone), next interval adapted to recall
- ✅ Read-aloud recaps with the device's voice (en-IN / hi-IN / mr-IN)
- 🟡 Recaps and companion replies are read aloud by the device’s voice; no server-side audio files are generated
- 🟡 Teach-back by voice: dictate with the browser’s speech input (needs browser support; Chrome sends audio to Google, and the app says so)

## 5. Resources & coverage
- ✅ Coverage of syllabus topics by uploaded materials (covered / partly / missing), with the estimate explained; manual links always count
- ✅ Gap list links straight to each topic's resources
- ✅ Claude web search for readings, videos, OER and PDFs: only URLs the search returned are kept; relevance, difficulty, free/paid shown; link checks with date; unreachable links flagged
- ✅ Trusted directory (NCERT, DIKSHA, NPTEL, SWAYAM, NDLI, Khan Academy, OpenStax, MIT OCW, YouTube, Wikipedia) works without AI
- ✅ Save, dismiss and add own links (validated, ownership-checked)
- ✅ Community-flagged incorrect resources: “incorrect or outdated” flags are counted and shown on resource posts and carried into resources saved from the community
## 6. Companion
- ✅ Available from every page (floating button and nav); opened from a topic, it knows the topic and uses passages from the student’s own materials as reference data, kept apart from its instructions
- ✅ Streaming replies, each labelled AI / simulated AI / not AI, with a “Used: …” line listing the data categories it drew on — only those allowed in Privacy, and only journal entries the student shared
- ✅ Suggestions become buttons; nothing happens until the student clicks; only allow-listed actions (book a session, focus timer, plan the week, fresh start, open a topic or practice, flashcards, mistakes, add a goal, reflect)
- ✅ Tone slider from friendly study buddy to firm, respectful mentor; how hard to push; reminder frequency
- ✅ Starters for “what now”, planning, falling behind, reflection and careers; conversations listed, renamed from the first message, deletable
- ✅ Distress is answered with support (Tele-MANAS 14416, emergency 112) without calling the AI
- ✅ Without AI it explains what it can still do and offers the same actions; usage limits are explained
- ✅ Conversation memories only when memory is on, always tentative, visible and deletable in Settings → Memory
- 🟡 Voice input uses the browser’s speech recognition (not available in every browser); replies can be read aloud
## 7. Calendar & time management
- ✅ Week grid (desktop) and agenda (phone): classes, assignments, exams, revision, projects, focus, applications, personal, reminders; regular commitments and Google busy blocks shown alongside
- ✅ Events with repeats (daily/weekly, until), reminders, countdowns, deadlines that don’t block time, places and notes; edit, delete, mark done
- ✅ Natural-language quick add (“Chemistry test on 23/10 at 10am”, “coaching every Mon and Wed 5–7pm”, “kal shaam 7 baje”): Claude when configured, else rules (day-first dates, Hindi/Marathi time words); always a reviewed draft with assumptions and clash warnings
- ✅ Time zones: Asia/Kolkata by default, per-student setting; repeats keep local time across DST
- ✅ Planner: next roadmap topics, deadline work and exam revision vs free time (commitments, events, busy blocks, 10-min buffers, breaks, daily limit from the weekly target, preferred times); estimates adapt to the student’s measured pace; when it doesn’t fit, concrete choices with their effect (more time, quick review, two weeks, deadlines first); nothing saved until the student agrees
- ✅ Study sessions: start, focus timer, finish with actual minutes, what went well/difficult, optional energy; planned vs actual; unplanned study log; XP once per session
- ✅ Restart flow (fresh start, catch up gradually, exams first) with a lighter first three days and respread revisions
- ✅ In-app reminders, exam/deadline countdowns (7/3/1 days), reminder frequency, quiet hours; 🔌 phone push/email not integrated
- ✅ .ics export for any calendar app
- 🔌 Google Calendar (needs GOOGLE_CLIENT_ID/SECRET): least-privilege scopes (calendar.app.created + calendar.freebusy), separate “Kadam — study plan” calendar, every change previewed and approved, conflicts resolved side by side, choice of what to copy, encrypted tokens, disconnect (optionally deleting the calendar) — tested against an in-memory Google double
- ✅ Today: one clear start action, up to three priorities, due revisions and flashcards, countdowns, this week’s planned vs done, quick focus, study log, restart and obstacle prompts, welcome-back celebration
## 8. Journal & study log
- ✅ Private journal: quick check-ins (mood, optional energy, one line), reflections (went well / difficult / topics, prefilled with today’s planned vs actual), notes, photos (up to 4) and recorded voice notes — never shared to Community
- ✅ Per-entry AI permission (off by default) plus the Privacy master switch; turning either off removes memories and suggestions derived from the entry; deleting an entry deletes its files and memories
- ✅ Study log: 14 days of planned vs actual minutes, sessions with topics, difficulties, achievements, missed reasons and check-in mood
- ✅ Task suggestions from shared entries (AI or rules) and weekly reviews (highlights, tentative patterns, difficulties, small next steps) that state exactly what was used; suggestions are proposals the student accepts or dismisses
- ✅ Wellbeing safeguard: entries that sound like distress show Tele-MANAS (14416) and 112 and are not analysed
- 🔌 Voice-note transcription needs a transcription service; recordings are stored privately either way

## 9. Progress & experiments
- ✅ Real improvement: study time per week (planned vs actual), practice accuracy and recall-at-revision trends, improvement claimed only with enough data
- ✅ Consistency heatmap (no streak loss), returns after breaks celebrated, topics studied / understanding checked / revised per subject, recurring difficulties
- ✅ Personal experiments: templates suggested from the study log or the student’s own design; baseline vs during, honest small-sample notes, student verdict and reflection; sessions linked to the running experiment
## 10. Goals & career discovery
- ✅ Goals with why-it-matters, milestones, current priority; career interests with roles, companies, cities and work modes
- ✅ Students with a clear direction get skills, starter projects, roles and ways in for 22 domains immediately (labelled general starting points), and a one-click goal with milestones
- ✅ Discovery review after about three months (84 days since starting and 30 active days); missed days never reset anything; progress shown
- ✅ Preliminary findings from 3 active days, clearly labelled as preliminary
- ✅ Each possibility shows what points there, the evidence, what’s uncertain, a next step suited to the education stage, and an exploration project; a “Limits” section lists data not used and demo days
- ✅ Weak activity (a few minutes in a subject) isn’t treated as evidence
- ✅ Explorations (mini projects, simulations described as learning activities, informational interviews, reading): reflection, “more / same / less interested”, XP once
- ✅ Rule-based review without AI; with AI, Claude refines a draft the app computed from permitted data
- ✅ Test clock: labelled demonstration history (Settings → Developer) unlocks the full review in tests and demos
## 11. Opportunities & applications
- ✅ Official directory of recurring Indian programmes and portals (PM Internship Scheme, AICTE, NATS, NAPS, National Scholarship Portal, INSPIRE, HBCSE Olympiads, Smart India Hackathon, NITI Aayog, SRFP, PMRF, NCS, GSoC; Internshala and Unstop as portals only), each with source link, eligibility, education, location, mode, duration, published pay and deadline text; only broadly stable facts, with a pointer to the official page
- ✅ Ranked by education stage, chosen directions, preferred cities and work mode, with plain reasons; filters for type, mode, other stages and closed openings
- ✅ Save any posting by link; paste its text and AI (labelled) or the rule-based reader fills in details, never inventing dates or pay; students can correct everything; manual links are private
- ✅ Link checks (private-network guard, redirects re-checked) record the date; failures to reach a site are never reported as a dead link; closed one-off openings are marked expired; recurring programmes never expire
- 🔌 Permitted feeds (RSS, Atom, JSON) via `OPPORTUNITY_FEEDS`, refreshed every 6 hours without duplicates; nothing is scraped
- ✅ Saving adds the deadline to the calendar with a countdown and reminder; application tracker (saved → preparing → applied → interviewing → offer / not selected / withdrawn), notes, CV used, dated next step as a calendar reminder
- ✅ Fit check: requirements vs approved achievements (shown), studied subjects and listed skills (not counted as shown), eligibility left for the student to confirm; student choices override and survive re-checks; AI version labelled and can’t claim a match without real evidence
- ✅ A gap becomes a goal with milestones before the deadline and a first work session in the calendar
- ✅ Interview practice: questions from the opening and approved portfolio; typed or dictated answers; STAR check, strengths, improvements and follow-up (AI labelled, rule-based without AI)
## 12. Portfolio & CV
- ✅ Achievements (projects, coursework, internships, research, responsibilities, volunteering, competitions, awards, certificates) with evidence links and private evidence files (PDF/images)
- ✅ Drafts until the student approves (“accurate, my own work, I can back it up”); editing asks again; XP once and only with evidence
- ✅ Suggestions from completed explorations and journal “what went well” entries become pre-filled drafts
- ✅ “Shown vs studied”: skills from approved work vs subjects studied but not yet shown; gaps against chosen directions with starter projects
- ✅ Education records exactly as stated by the student
- ✅ CV builder from approved data only: headline, contact line and summary in the student’s words, chosen entries, skills, reorderable sections; preview, print/save as PDF, Markdown and plain-text export
- ✅ Truthful tailoring: relevant entries and skills first; requirements without evidence listed as “not claimed”; AI rewordings (labelled) only from the achievement’s own text, rejected if they add figures, and applied only when the student accepts
## 13. XP & visible growth
- ✅ Understandable XP rules (shown in the app), once per meaningful action, daily caps; levels; badges with how to earn them; recent XP with reasons
- ✅ Optional Kadamba tree that grows with level; quiet interface hides XP, levels, badges and celebrations while keeping real progress
## 14. Community
- ✅ Optional and pseudonymous: join with a handle (checked for contact details and look-alike numbers); name, email, school, journal, progress and goals are never shown
- ✅ Under-18s join only after guardian consent is recorded; spaces by age band (all-ages and strictly moderated / 13–17 / 18+); undisclosed age sees all-ages only; students create groups only for their own bracket
- ✅ Official groups (boards, Class 11–12 science, JEE, NEET, coding, teen circle, first-year college, UPSC, internships) plus student-run groups
- ✅ Questions, peer explanations, resources (link + attribution required), discussions, goals and showcases; “helpful” marks; PEER_HELP XP once per explanation; notifications for replies
- ✅ Deliberate sharing of an achievement (approved, not demo), goal, saved resource or own note as an editable copy with attribution; journals can never be shared
- ✅ Phone numbers, emails and messaging handles are refused; posts showing possible distress are held for a moderator and the author gets support lines
- ✅ Reports (spam, harassment, incorrect, inappropriate, personal details, someone in danger); auto-hide after 2 reports in all-ages/13–17 spaces and 3 in 18+; “someone in danger” hides at once and reaches out to the author
- ✅ Moderation queue (distress first) with keep / remove / pause posting for 7 days; decisions recorded and authors told; moderators can’t judge their own content
- ✅ Blocking hides both students from each other and ends buddy links; leaving deletes everything the student posted
- ✅ Focus rooms: presence only (handle, goal, shared timer), by audience; joining starts a personal focus session; 30-second refresh, low data
- ✅ Study buddies: only discoverable students, same age bracket, not under 13; request, accept, decline, end
- ✅ Rate limits on posts and replies
- 🟡 Moderators are appointed in the database (a development switch exists in Settings → Developer); no automated toxicity classifier — moderation relies on reports, contact-detail blocking and distress detection
## 16. Navigation & design
- ✅ Six main spaces, calendar always in the header, companion button on every page, mobile bottom bar
- ✅ Loading skeletons per route, error boundary, friendly not-found pages, empty states, offline notice, Lite mode
- ✅ Forms keep what the student typed when a submission fails
- ✅ Phone layouts: an automated check that every main page fits a 390-px screen without sideways scrolling
## 17. Architecture
- ✅ Connected data model (syllabus → topics → materials → lessons/notes/cards/practice → sessions → reflections → goals → applications → CV → community posts), persistent Postgres storage
- ✅ Authentication, private files served only to their owner, per-student isolation in every service, server-side secrets (env validated at start-up; OAuth tokens encrypted)
- ✅ Trusted application instructions kept separate from retrieved content (materials, web pages, postings, journal text are wrapped and labelled as data)
- ✅ Background processing (job queue with dedupe and retries), caching via Cache Components, usage limits (AI requests per student per day, community rate limits)
- ✅ Outbound fetches guarded against private-network addresses
- ✅ Clear setup (`README.md`, `.env.example` without secrets, migrations, `npm run db:seed`), labelled demo data, capability page showing what works

## 18. Verification
- ✅ Connected journey in one end-to-end test (`tests/e2e/journey.spec.ts`): syllabus → roadmap → topic with traceable sources → practice → revision in the calendar → reflection with chosen AI permission → XP counted once → saved opportunity → gaps → real achievement in a CV → deliberate community post
- ✅ Persistence and per-student isolation across every feature (`tests/integration/isolation.test.ts`)
- ✅ Memory controls (view, correct, delete; revoking journal access forgets what was learned) and calendar permissions (least-privilege scopes, preview before change, disconnect)
- ✅ Three-month discovery review via labelled demo history and the per-student test clock
- ✅ Phone-width check for every main page; production build; lint with zero warnings

