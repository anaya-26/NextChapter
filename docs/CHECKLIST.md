# Kadam — module checklist

Legend: ✅ done and tested · 🟡 partial / works with limitations · ⏳ planned in a later stage · 🔌 needs an external credential to go live

Last updated: Stage 2 (syllabus & roadmap).

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
- ✅ Detailed material is generated when a topic is opened (Stage 3)

## 4. Topic learning workspace — ⏳ Stage 3
## 5. Resources & coverage — ⏳ Stage 3
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
