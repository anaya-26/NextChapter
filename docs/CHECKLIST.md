# Kadam — module checklist

Legend: ✅ done and tested · 🟡 partial / works with limitations · ⏳ planned in a later stage · 🔌 needs an external credential to go live

Last updated: Stage 3 (topic workspace, resources & coverage).

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
- ⏳ Missed-session obstacle discussion (Stage 4–5)

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
- ⏳ Audio recaps generated server-side; teach-back by voice (Stage 7 companion)

## 5. Resources & coverage
- ✅ Coverage of syllabus topics by uploaded materials (covered / partly / missing), with the estimate explained; manual links always count
- ✅ Gap list links straight to each topic's resources
- ✅ Claude web search for readings, videos, OER and PDFs: only URLs the search returned are kept; relevance, difficulty, free/paid shown; link checks with date; unreachable links flagged
- ✅ Trusted directory (NCERT, DIKSHA, NPTEL, SWAYAM, NDLI, Khan Academy, OpenStax, MIT OCW, YouTube, Wikipedia) works without AI
- ✅ Save, dismiss and add own links (validated, ownership-checked)
- ⏳ Community-flagged incorrect resources (Stage 11)
## 6. Companion — ⏳ Stage 7
## 7. Calendar & time management — ⏳ Stage 4
## 8. Journal & study log — ⏳ Stage 5
## 9. Progress & experiments — 🟡 XP ledger done; views ⏳ Stage 6
## 10. Goals & career discovery — 🟡 goals, milestones, priority, career interests done; discovery review ⏳ Stage 8
## 11. Opportunities — ⏳ Stage 9
## 12. Portfolio & CV — ⏳ Stage 10
## 13. XP & visible growth — 🟡 rules, dedupe, caps, return celebration, badges done; UI ⏳ Stage 6
## 14. Community — ⏳ Stage 11
## 16. Navigation & design
- ✅ Six main spaces, calendar always in the header, companion button on every page, mobile bottom bar
- ✅ Loading skeletons per route, error boundary, empty states, offline notice, Lite mode
## 17–18. Architecture & verification — ongoing; see `README.md` and `tests/`
