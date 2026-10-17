import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Split a comma/newline separated string into trimmed unique values. */
export function splitList(raw: string | null | undefined, max = 30): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, max);
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Readable plain text from lesson markdown (for read-aloud): drops markup, citations, diagrams and LaTeX syntax. */
export function markdownToSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[\d+\]\]/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " (see the formula on screen) ")
    .replace(/\$([^$\n]+)\$/g, (_, m: string) => m.replace(/\\[a-z]+/gi, " ").replace(/[{}^_]/g, " "))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/([.!?:])(\s*\.)+/g, "$1")
    .trim();
}
