import { formatTimestamp } from "./captions";

/** Where a cited passage lives: the source viewer, opened at the page or timestamp. */
export function sourceHref(c: { sourceId: string; page: number | null; startSec: number | null }) {
  const q = c.page ? `?page=${c.page}` : c.startSec != null ? `?t=${Math.floor(c.startSec)}` : "";
  return `/learn/sources/${c.sourceId}${q}`;
}

export function locationLabel(c: { page: number | null; startSec: number | null; endSec: number | null }) {
  if (c.page) return `page ${c.page}`;
  if (c.startSec != null) return `${formatTimestamp(c.startSec)}${c.endSec != null ? `–${formatTimestamp(c.endSec)}` : ""}`;
  return null;
}
