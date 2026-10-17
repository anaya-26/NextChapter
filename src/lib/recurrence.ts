import { rrulestr } from "rrule";
import { zonedParts, zonedToUtc } from "./time";

/**
 * Recurring events store an RFC 5545 RRULE (without the "RRULE:" prefix) interpreted in the
 * event's own timezone, so "every Monday at 5 pm" stays at 5 pm local time.
 */

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A Date whose UTC fields equal the wall-clock time of `date` in `tz` (rrule works in "floating" time). */
function toWall(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

function fromWall(wall: Date, tz: string): Date {
  const key = wall.toISOString().slice(0, 10);
  const hm = wall.toISOString().slice(11, 16);
  return zonedToUtc(key, hm, tz);
}

export function weeklyRule(days: number[], untilKey?: string | null): string {
  const byday = [...new Set(days)].sort().map((d) => DAY_CODES[d]).join(",");
  return `FREQ=WEEKLY;BYDAY=${byday}${untilKey ? `;UNTIL=${untilKey.replace(/-/g, "")}T235959Z` : ""}`;
}

export function dailyRule(untilKey?: string | null): string {
  return `FREQ=DAILY${untilKey ? `;UNTIL=${untilKey.replace(/-/g, "")}T235959Z` : ""}`;
}

export function describeRule(rule: string | null): string | null {
  if (!rule) return null;
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]));
  const until = parts.UNTIL ? ` until ${parts.UNTIL.slice(6, 8)}/${parts.UNTIL.slice(4, 6)}/${parts.UNTIL.slice(0, 4)}` : "";
  if (parts.FREQ === "DAILY") return `Every day${until}`;
  if (parts.FREQ === "WEEKLY") {
    const days = (parts.BYDAY ?? "").split(",").filter(Boolean).map((c) => DAY_NAMES[DAY_CODES.indexOf(c as (typeof DAY_CODES)[number])]);
    if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) return `Every weekday${until}`;
    return `Every ${days.join(", ") || "week"}${until}`;
  }
  return "Repeats";
}

/** Weekdays (0 = Sunday) of a weekly rule, for editing forms. */
export function ruleDays(rule: string | null): number[] {
  const byday = /BYDAY=([A-Z,]+)/.exec(rule ?? "")?.[1];
  return byday ? byday.split(",").map((c) => DAY_CODES.indexOf(c as (typeof DAY_CODES)[number])).filter((d) => d >= 0) : [];
}

export function ruleUntilKey(rule: string | null): string | null {
  const until = /UNTIL=(\d{8})/.exec(rule ?? "")?.[1];
  return until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null;
}

/** UTC occurrences of an event that overlap [from, to). Non-recurring events yield at most one. */
export function expandOccurrences(
  ev: { startAt: Date; endAt: Date; rrule: string | null; timezone: string },
  from: Date,
  to: Date,
  limit = 400,
): { start: Date; end: Date }[] {
  const duration = ev.endAt.getTime() - ev.startAt.getTime();
  if (!ev.rrule) {
    return ev.startAt < to && ev.endAt > from ? [{ start: ev.startAt, end: ev.endAt }] : [];
  }
  let rule;
  try {
    rule = rrulestr(`RRULE:${ev.rrule}`, { dtstart: toWall(ev.startAt, ev.timezone) });
  } catch {
    return ev.startAt < to && ev.endAt > from ? [{ start: ev.startAt, end: ev.endAt }] : [];
  }
  const windowStart = toWall(new Date(from.getTime() - duration), ev.timezone);
  const windowEnd = toWall(to, ev.timezone);
  const out: { start: Date; end: Date }[] = [];
  for (const wall of rule.between(windowStart, windowEnd, true)) {
    const start = fromWall(wall, ev.timezone);
    const end = new Date(start.getTime() + duration);
    if (start < to && end > from) out.push({ start, end });
    if (out.length >= limit) break;
  }
  return out;
}
