/** Deterministic grading helpers (no AI needed). */

export function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s ]+/g, " ")
    .replace(/[.,;:!?'"“”‘’()]/g, "")
    .trim();
}

/** Parses "4.2", "4,200", "3.0 × 10^8", "3e8", "-0.5 m/s" → number (unit ignored). */
export function parseNumeric(input: string): number | null {
  const s = input
    .trim()
    .replace(/(\d),(?=\d{2,3}\b)/g, "$1")
    .replace(/\s*[x×*]\s*10\s*\^?\s*\(?\s*([-−+]?\d+)\s*\)?/i, "e$1")
    .replace(/−/g, "-");
  const m = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(s);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Within absolute tolerance if given, else 1% relative (or 1e-9 for zero). */
export function numericMatches(given: number, expected: number, tolerance?: number | null): boolean {
  if (tolerance != null && tolerance > 0) return Math.abs(given - expected) <= tolerance;
  if (expected === 0) return Math.abs(given) <= 1e-9;
  return Math.abs(given - expected) / Math.abs(expected) <= 0.01;
}

export function sameSet(a: string[], b: string[]): boolean {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

/** Fraction of positions in the right place. */
export function orderingScore(given: string[], expected: string[]): number {
  if (!expected.length) return 0;
  let right = 0;
  expected.forEach((id, i) => {
    if (given[i] === id) right++;
  });
  return right / expected.length;
}
