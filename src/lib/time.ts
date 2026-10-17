/**
 * Timezone helpers built on Intl (no runtime dependency). All instants are UTC `Date`s;
 * "local" values are wall-clock strings in a named IANA timezone (default Asia/Kolkata).
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in a timezone. */
export function zonedParts(date: Date, tz: string = DEFAULT_TIMEZONE): Parts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

/** Offset of `tz` from UTC at `date`, in minutes (IST = +330). */
export function tzOffsetMinutes(date: Date, tz: string = DEFAULT_TIMEZONE): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant for a wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in `tz`. Handles DST gaps. */
export function zonedToUtc(localDate: string, localTime: string, tz: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = localTime.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm || 0, 0);
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** "YYYY-MM-DD" for the local calendar day of `date` in `tz`. */
export function localDateKey(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:MM" local time of `date` in `tz`. */
export function localTimeKey(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  const p = zonedParts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function startOfLocalDay(date: Date, tz: string = DEFAULT_TIMEZONE): Date {
  return zonedToUtc(localDateKey(date, tz), "00:00", tz);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Date-only value (UTC midnight) suitable for Prisma `@db.Date` columns. */
export function dateOnly(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function dateOnlyKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" key. */
export function weekdayOfKey(dateKey: string): number {
  return dateOnly(dateKey).getUTCDay();
}

/** Monday-based week start key for a local date key. */
export function weekStartKey(dateKey: string): string {
  const wd = weekdayOfKey(dateKey);
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDaysToKey(dateKey, diff);
}

export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / 86400000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatHm(totalMinutes: number): string {
  const t = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatInTz(
  date: Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions,
  locale = "en-IN",
): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(date);
}
