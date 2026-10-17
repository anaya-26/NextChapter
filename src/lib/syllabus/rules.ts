/**
 * Rule-based syllabus parser. Used when AI is unavailable (and by the mock provider).
 * It never invents content: every unit/topic comes from a line of the source text, and
 * anything it is unsure about is flagged for the student's correction step.
 */

export type ParsedTopic = { title: string; uncertain: boolean; excerpt: string | null; statedObjectives: string[] };
export type ParsedUnit = { title: string; uncertain: boolean; excerpt: string | null; topics: ParsedTopic[] };
export type ParsedAssessment = { label: string; detail: string; excerpt: string | null; uncertain: boolean };
export type ParsedSyllabus = {
  title: string | null;
  units: ParsedUnit[];
  assessment: ParsedAssessment[];
  unreadable: { location: string; description: string }[];
  warnings: string[];
};

const UNIT_RE = /^(unit|module|part|block|section|paper|theme)\s*[-–—:.]?\s*([ivxlcdm]+|\d+|[a-z])(?=[\s:.)\-–—]|$)\s*[-–—:.)]*\s*(.*)$/i;
const CHAPTER_RE = /^(chapter|ch\.|lesson)\s*[-–—:.]?\s*(\d+|[ivxlcdm]+)(?=[\s:.)\-–—]|$)\s*[-–—:.)]*\s*(.*)$/i;
const ASSESS_HEAD_RE =
  /^(assessment|evaluation|examination scheme|exam pattern|scheme of (?:examination|evaluation)|marking scheme|marks distribution|question paper (?:design|pattern)|internal assessment)\b\s*[:\-–—]?\s*(.*)$/i;
const ASSESS_HINT_RE = /\b\d+\s*(?:marks?|%|percent|hours?|hrs?|credits?|minutes?)\b|\bweightage\b/i;
const BULLET_RE = /^\s*(?:[-•*○▪◦●·►]|\(?(?:\d{1,2}(?:\.\d{1,2})*|[a-hj-z]|[ivx]{1,4})[.)])\s+/i;
const MARKS_RE = /\(\s*(?:marks?\s*[:\-–]?\s*)?(\d{1,3})\s*(?:marks?)?\s*\)|[-–—,:]\s*(\d{1,3})\s*marks?\b/i;
const NOISE_RE = /[|~^¥€§¶{}<>\\]/;

function letterRatio(s: string) {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  const visible = s.replace(/\s/g, "").length || 1;
  return letters / visible;
}

function clean(line: string) {
  return line
    .replace(/ /g, " ")
    .replace(/[‐‑‒]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isPageNoise(line: string) {
  return /^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(line);
}

function capitalise(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function tidyTitle(s: string) {
  return capitalise(
    s
      .replace(/^[\s\-–—:;,.]+/, "")
      .replace(/[\s\-–—:;,]+$/, "")
      .replace(/\.$/, "")
      .trim(),
  );
}

function looksUncertain(s: string) {
  return letterRatio(s) < 0.6 || NOISE_RE.test(s) || s.length > 140 || /\b\w{1,2}-$/.test(s);
}

/** Split a list line into items on semicolons, or on commas when it reads like a list. */
export function splitItems(text: string): string[] {
  const t = text.trim().replace(/\.$/, "");
  if (!t) return [];
  if (t.includes(";")) return t.split(";").map((x) => x.trim()).filter(Boolean);
  // Commas outside parentheses.
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of t) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const items = parts.map((p) => p.replace(/^\s*and\s+/i, "").trim()).filter(Boolean);
  if (items.length >= 3 && items.every((i) => i.length <= 70)) return items;
  return [t];
}

/** Split "Heading title — item; item" into its title and list part. */
function splitHeading(rest: string): { title: string; items: string } {
  const m = /\s[—–-]\s|:\s/.exec(rest);
  if (m && m.index > 0) {
    return { title: rest.slice(0, m.index).trim(), items: rest.slice(m.index + m[0].length).trim() };
  }
  return { title: rest.trim(), items: "" };
}

/** Joins OCR/PDF line breaks that split a sentence or list across lines. */
export function joinContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const structural = UNIT_RE.test(line) || CHAPTER_RE.test(line) || BULLET_RE.test(line) || ASSESS_HEAD_RE.test(line);
    if (prev !== undefined && !structural && prev !== "") {
      const startsLower = /^\p{Ll}/u.test(line);
      const prevOpen = /[,;:–—-]$/.test(prev) || /\b(and|of|the|in|to|with|for)$/i.test(prev);
      if (startsLower || prevOpen) {
        out[out.length - 1] = prev.endsWith("-") && startsLower ? prev.slice(0, -1) + line : `${prev} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

export function parseSyllabusText(text: string, opts: { ocrConfidence?: number } = {}): ParsedSyllabus {
  const rawLines = text.replace(/\r/g, "").split("\n").map(clean);
  const lines = joinContinuations(rawLines.filter((l) => l && !isPageNoise(l)));
  const result: ParsedSyllabus = { title: null, units: [], assessment: [], unreadable: [], warnings: [] };

  let unitPrefix: string | null = null;
  let current: ParsedUnit | null = null;
  let parentFromUnitHeading: ParsedUnit | null = null;
  let mode: "content" | "assessment" = "content";
  let droppedProse = 0;

  const pushTopic = (title: string, excerpt: string) => {
    const t = tidyTitle(title);
    if (t.length < 3) return;
    if (!current) {
      current = { title: "Syllabus topics", uncertain: true, excerpt: null, topics: [] };
      result.units.push(current);
    }
    if (current.topics.some((x) => x.title.toLowerCase() === t.toLowerCase())) return;
    current.topics.push({ title: t, uncertain: looksUncertain(t), excerpt: excerpt.slice(0, 220), statedObjectives: [] });
  };

  const addAssessment = (line: string) => {
    const idx = line.indexOf(":");
    const label = idx > 0 && idx < 60 ? line.slice(0, idx).trim() : "Assessment";
    const detail = idx > 0 && idx < 60 ? line.slice(idx + 1).trim() : line;
    if (detail) result.assessment.push({ label, detail: detail.replace(/\.$/, ""), excerpt: line, uncertain: looksUncertain(line) });
  };

  lines.forEach((line, i) => {
    if (i === 0 && !UNIT_RE.test(line) && !CHAPTER_RE.test(line) && line.length <= 140 && !BULLET_RE.test(line)) {
      result.title = tidyTitle(line.replace(/\(.*?\)\s*$/, ""));
      return;
    }
    if (letterRatio(line) < 0.4 && line.length > 4) {
      result.unreadable.push({ location: `line ${i + 1}`, description: `Could not read: “${line.slice(0, 60)}”` });
      return;
    }

    const assessHead = ASSESS_HEAD_RE.exec(line);
    if (assessHead) {
      mode = "assessment";
      if (assessHead[2]) addAssessment(assessHead[2]);
      return;
    }

    const unitMatch = UNIT_RE.exec(line);
    const chapterMatch = unitMatch ? null : CHAPTER_RE.exec(line);
    if (mode === "assessment" && !unitMatch && !chapterMatch) {
      addAssessment(line);
      return;
    }
    mode = "content";

    // Stated assessment details outside an "Assessment" heading, e.g. "Theory: 70 marks".
    if (!unitMatch && !chapterMatch && ASSESS_HINT_RE.test(line) && /\b(exam|examination|test|practical|theory|internal|external|project|viva)\b/i.test(line)) {
      addAssessment(line);
      return;
    }

    if (unitMatch) {
      const label = `${capitalise(unitMatch[1].toLowerCase())} ${unitMatch[2].toUpperCase()}`;
      const marks = MARKS_RE.exec(unitMatch[3] ?? "");
      const { title, items } = splitHeading((unitMatch[3] ?? "").replace(MARKS_RE, "").trim());
      unitPrefix = title ? `${label}: ${tidyTitle(title)}` : label;
      if (marks) {
        result.assessment.push({ label: unitPrefix, detail: `${marks[1] ?? marks[2]} marks`, excerpt: line, uncertain: false });
      }
      current = { title: unitPrefix, uncertain: looksUncertain(unitPrefix), excerpt: line.slice(0, 220), topics: [] };
      parentFromUnitHeading = current;
      result.units.push(current);
      if (items) for (const it of splitItems(items)) pushTopic(it, line);
      return;
    }

    if (chapterMatch) {
      const { title, items } = splitHeading(chapterMatch[3] ?? "");
      const chapterLabel = `${capitalise(chapterMatch[1].replace(".", "").toLowerCase())} ${chapterMatch[2]}${title ? `: ${tidyTitle(title)}` : ""}`;
      // Chapters under a unit become their own units, labelled with the unit.
      if (parentFromUnitHeading && parentFromUnitHeading.topics.length === 0) {
        result.units = result.units.filter((u) => u !== parentFromUnitHeading);
      }
      current = {
        title: unitPrefix ? `${unitPrefix} · ${chapterLabel}` : chapterLabel,
        uncertain: looksUncertain(chapterLabel),
        excerpt: line.slice(0, 220),
        topics: [],
      };
      result.units.push(current);
      parentFromUnitHeading = null;
      if (items) for (const it of splitItems(items)) pushTopic(it, line);
      else if (title) pushTopic(title, line);
      return;
    }

    const content = line.replace(BULLET_RE, "");
    const items = splitItems(content);
    if (items.length > 1 || content.length <= 90) {
      for (const it of items) pushTopic(it, line);
    } else {
      droppedProse++;
      if (current && !current.excerpt) current.excerpt = content.slice(0, 220);
    }
  });

  result.units = result.units.filter((u) => u.topics.length > 0 || u.title !== "Syllabus topics");
  if (!lines.some((l) => UNIT_RE.test(l) || CHAPTER_RE.test(l))) {
    result.warnings.push("No unit or chapter headings were found, so topics are grouped together. Please check the structure.");
  }
  if (droppedProse) {
    result.warnings.push(`${droppedProse} descriptive sentence(s) were not turned into topics. Add any topics they mention.`);
  }
  if (opts.ocrConfidence !== undefined && opts.ocrConfidence < 75) {
    result.warnings.push(`Text recognition confidence was low (${Math.round(opts.ocrConfidence)}%). Check spellings against your original.`);
  }
  if (!result.units.length) {
    result.warnings.push("No topics could be identified. Paste the text or add topics manually.");
  }
  if (result.assessment.length === 0) {
    result.warnings.push("No assessment details were stated in the text, so none were added.");
  }
  return result;
}

/** Rough effort estimate (minutes) when AI is unavailable. */
export function estimateMinutes(title: string): number {
  const heavy = /\b(theorem|law|laws|derivation|numerical|equation|analysis|proof|algorithm|integration|differentiation|mechanism|circuit|accounting|calculation)\b/i;
  const light = /\b(introduction|overview|definition|meaning|basics|history|types)\b/i;
  if (heavy.test(title)) return 90;
  if (light.test(title)) return 40;
  return 60;
}
