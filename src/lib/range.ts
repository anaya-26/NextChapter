/** Parses a single "bytes=start-end" Range header against a file size; null when absent or unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return start <= end ? { start, end } : null;
}
