/** WebVTT / SRT caption parsing into timestamped cues and passage-sized chunks. */

export type Cue = { start: number; end: number; text: string };

function toSeconds(ts: string): number {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(ts.trim());
  if (!m) return Number.NaN;
  const [, h, mm, ss, ms] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

export function parseCaptions(raw: string): Cue[] {
  const text = raw.replace(/\r/g, "").replace(/^﻿/, "");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;
    const [a, b] = lines[timingIdx].split("-->");
    const start = toSeconds(a);
    const end = toSeconds(b.split(/\s+/).filter(Boolean)[0] ?? "");
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const body = lines
      .slice(timingIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }
  // Drop rolling-caption duplicates (common in auto-generated captions).
  return cues.filter((c, i) => i === 0 || c.text !== cues[i - 1].text);
}

/** Merge cues into passages of roughly `targetSeconds` for retrieval and citation. */
export function chunkCues(cues: Cue[], targetSeconds = 60): Cue[] {
  const chunks: Cue[] = [];
  let cur: Cue | null = null;
  for (const c of cues) {
    if (!cur) cur = { ...c };
    else if (c.end - cur.start > targetSeconds) {
      chunks.push(cur);
      cur = { ...c };
    } else {
      cur.end = c.end;
      cur.text = `${cur.text} ${c.text}`;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
