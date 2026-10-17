import * as chrono from "chrono-node";
import { zonedParts } from "./time";

/**
 * Rule-based reading of a pasted opportunity posting (used when AI isn't configured, and to
 * double-check AI output), plus the keyword matching behind gap analysis. Nothing here
 * invents details: anything not found in the text stays empty.
 */

export type OpportunityKindName = "INTERNSHIP" | "PROGRAMME" | "COMPETITION" | "SCHOLARSHIP" | "RESEARCH" | "FELLOWSHIP" | "HACKATHON" | "JOB" | "OTHER";
export type WorkModeName = "REMOTE" | "ONSITE" | "HYBRID" | "UNKNOWN";

export type PostingDraft = {
  title: string | null;
  organisation: string | null;
  kind: OpportunityKindName;
  eligibility: string | null;
  educationRequirements: string | null;
  location: string | null;
  workMode: WorkModeName;
  duration: string | null;
  compensation: string | null;
  deadlineKey: string | null;
  deadlineText: string | null;
  requirements: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");

function field(text: string, labels: string, max = 200): string | null {
  // A label at the start of a line, or after a full stop in one-line feed descriptions.
  const re = new RegExp(`(?:^|[.;|]\\s+)\\s*(?:[-*•]\\s*)?(?:${labels})\\s*[:\\-–]\\s*(.+)$`, "im");
  const m = re.exec(text);
  if (!m) return null;
  const value = m[1].split(/\.\s+(?=[A-Z][A-Za-z ]{1,30}:)/)[0];
  return value.trim().replace(/\s+/g, " ").replace(/\.$/, "").slice(0, max) || null;
}

export function kindFromText(text: string): OpportunityKindName {
  const t = text.toLowerCase();
  if (/hackathon/.test(t)) return "HACKATHON";
  if (/scholarship/.test(t)) return "SCHOLARSHIP";
  if (/fellowship/.test(t)) return "FELLOWSHIP";
  if (/olympiad|competition|contest|challenge|quiz/.test(t)) return "COMPETITION";
  if (/internship|intern\b/.test(t)) return "INTERNSHIP";
  if (/research (assistant|project|position)|\bjrf\b|\bsrf\b/.test(t)) return "RESEARCH";
  if (/apprentice|programme|program\b|bootcamp/.test(t)) return "PROGRAMME";
  if (/full[- ]time|job opening|we are hiring|vacancy/.test(t)) return "JOB";
  return "OTHER";
}

export function workModeFromText(text: string): WorkModeName {
  const t = text.toLowerCase();
  if (/hybrid/.test(t)) return "HYBRID";
  if (/remote|work from home|\bwfh\b|online/.test(t)) return "REMOTE";
  if (/on[- ]?site|in[- ]office|in person|on campus/.test(t)) return "ONSITE";
  return "UNKNOWN";
}

/** Reads "Apply by 30 Nov 2026" style deadlines (day-first, Indian style). */
export function deadlineFromText(text: string, now: Date, tz: string): { key: string; text: string } | null {
  const m = /(apply by|apply before|last date(?: to apply| of application| for applications)?|deadline|closes on|closing date|applications close|register by|registration closes)\s*(?:is|:|-|–|on)?\s*([^\n.;]{3,40})/i.exec(text);
  if (!m) return null;
  const p = zonedParts(now, tz);
  const reference = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  const r = chrono.en.GB.parse(m[2], { instant: reference, timezone: 0 }, { forwardDate: true })[0];
  if (!r || !r.start.isCertain("day")) return null;
  return { key: `${r.start.get("year")}-${pad(r.start.get("month")!)}-${pad(r.start.get("day")!)}`, text: `${m[1]} ${m[2]}`.trim() };
}

function bulletsAfter(text: string, heading: RegExp): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  const inline = lines[start].split(/[:\-–]\s*/).slice(1).join(" ").trim();
  if (inline) out.push(...inline.split(/,|;|\band\b/).map((s) => s.trim()));
  for (const l of lines.slice(start + 1)) {
    const t = l.trim();
    if (!t) {
      if (out.length) break;
      continue;
    }
    if (/^[A-Z][A-Za-z ]{2,40}:\s*$/.test(t) || (!/^[-*•\d]/.test(t) && out.length && t.endsWith(":"))) break;
    if (!/^([-*•]|\d+[.)])/.test(t) && out.length > 0 && !inline) break;
    out.push(t.replace(/^([-*•]|\d+[.)])\s*/, ""));
  }
  return out
    .map((s) => s.replace(/\s+/g, " ").replace(/[.;]$/, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 140)
    .slice(0, 12);
}

export function parsePostingText(raw: string, now: Date, tz: string): PostingDraft {
  const text = raw.replace(/ /g, " ").slice(0, 20000);
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length >= 4) ?? null;
  const deadline = deadlineFromText(text, now, tz);
  const requirements = [
    ...bulletsAfter(text, /^\s*(skills? required|required skills|requirements|skills|who can apply|what we('| a)re looking for|you should have|qualifications)\b/i),
  ];
  return {
    title: field(text, "title|role|position|opening") ?? (firstLine && firstLine.length <= 120 ? firstLine : null),
    organisation: field(text, "company|organisation|organization|employer|hosted by|offered by|institute", 120),
    kind: kindFromText(text),
    eligibility: field(text, "eligibility|who can apply|eligible candidates", 400),
    educationRequirements: field(text, "education|qualification|degree|course", 200),
    location: field(text, "location|city|place|venue", 120),
    workMode: workModeFromText(text),
    duration: field(text, "duration|period|tenure", 60) ?? (/\b(\d+)\s*(weeks?|months?)\b/i.exec(text)?.[0] ?? null),
    compensation: field(text, "stipend|salary|ctc|compensation|pay|remuneration|prize money|prizes?|scholarship amount", 120),
    deadlineKey: deadline?.key ?? null,
    deadlineText: deadline?.text ?? null,
    requirements: [...new Set(requirements)],
  };
}

// ───────────────────────── requirement matching ─────────────────────────

const STOP = new Set(
  "a an and or the of in on for to with from by at as be is are you your our we will can able ability good strong basic basics knowledge understanding of experience experienced familiarity familiar working work skills skill must should have has having plus least year years using use any some etc required preferred candidates candidate students student".split(
    " ",
  ),
);

export function keywords(s: string): string[] {
  return [
    ...new Set(
      s
        .toLowerCase()
        .replace(/c\+\+/g, "cplusplus")
        .replace(/[^a-z0-9#+\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)),
    ),
  ];
}

/** Requirements about who may apply (age, enrolment, marks…) can't be proven by a portfolio. */
export function isEligibilityRequirement(req: string): boolean {
  return /\b(age|aged|years old|citizen|nationality|resident|enrolled|enrol|pursuing|semester|year of study|final year|cgpa|gpa|percent|marks|graduat|class (8|9|10|11|12)|10th|12th|pass(ed)?\b|degree|diploma|b\.?tech|b\.?sc|m\.?sc|phd|female|women|income|certificate|no-objection|noc|aadhaar|bank account|not (previously|in full|employed)|nominated|passport|within the)\b|\d+\s*%|\d+\s*[–-]\s*\d+/i.test(req);
}

/** How strongly a piece of evidence text covers a requirement (0–1). */
export function coverage(req: string, evidence: string): number {
  const kw = keywords(req);
  if (!kw.length) return 0;
  const ev = new Set(keywords(evidence));
  const hits = kw.filter((k) => ev.has(k) || [...ev].some((e) => e.length >= 4 && k.length >= 4 && (e.startsWith(k) || k.startsWith(e))));
  return hits.length / kw.length;
}

export type DeadlineState = "OPEN" | "CLOSING_SOON" | "CLOSED" | "UNKNOWN";

export function deadlineState(deadline: Date | null, now: Date): DeadlineState {
  if (!deadline) return "UNKNOWN";
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) return "CLOSED";
  return ms <= 7 * 86400000 ? "CLOSING_SOON" : "OPEN";
}

/** Numbers (counts, percentages, amounts) that appear in a text — used to stop CV rewrites inventing figures. */
export function numbersIn(s: string): string[] {
  return [...new Set((s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")))];
}

/** A rewritten CV line may only use figures found in the original achievement. */
export function introducesNewNumbers(rewrite: string, source: string): string[] {
  const allowed = new Set(numbersIn(source));
  return numbersIn(rewrite).filter((n) => !allowed.has(n));
}
