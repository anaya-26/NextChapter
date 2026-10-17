/**
 * A simple, conservative check for words that suggest a student may be in distress. It never
 * diagnoses anything; it only decides whether to show support options (Tele-MANAS 14416,
 * emergency 112) next to what they wrote, and to keep automated suggestions out of the way.
 */
const PATTERNS = [
  /\b(kill|hurt|harm)(ing)? myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend (it all|my life)\b/i,
  /\b(don'?t|do not) want to (live|be alive|exist)\b/i,
  /\bno (reason|point) (to|in) (live|living|going on)\b/i,
  /\bcan'?t go on\b/i,
  /\bhopeless\b/i,
  /\bworthless\b/i,
  /\b(marna|mar jaun|mar jaaun|jeena nahi)\b/i,
  /मरना|मर जाऊं|जीना नहीं|आत्महत्या|मरायचं|जगायचं नाही/,
];

export function needsWellbeingSupport(...texts: (string | null | undefined)[]): boolean {
  const all = texts.filter(Boolean).join("\n");
  return PATTERNS.some((p) => p.test(all));
}

export const SUPPORT_LINES = [
  { name: "Tele-MANAS (free, 24×7, many Indian languages)", contact: "14416 or 1-800-891-4416" },
  { name: "Emergency", contact: "112" },
];
