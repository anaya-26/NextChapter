/**
 * Pure study-planning algorithm (no I/O). Fits study tasks into free time around classes,
 * commitments and other events, with breaks, buffers, a daily cap and deadlines. The service
 * layer gathers the inputs and turns the result into calendar sessions after the student agrees.
 */

export type Interval = { start: number; end: number };

export type PlanTask = {
  id: string;
  title: string;
  /** Minutes still needed (already adjusted for the student's own pace). */
  minutes: number;
  /** Work must finish before this instant (ms), e.g. an exam or a submission deadline. */
  dueAt: number | null;
  /** Higher first when deadlines tie. */
  priority: number;
  kind: "TOPIC" | "ASSIGNMENT" | "EXAM_PREP";
  topicId?: string | null;
  subjectId?: string | null;
  targetEventId?: string | null;
  optional?: boolean;
};

export type DayFrame = {
  dateKey: string;
  /** Study windows for the day; higher `pref` windows are filled first. */
  windows: (Interval & { pref: number })[];
  capMinutes: number;
  /** Study already planned that day (counts against the cap). */
  existingMinutes: number;
};

export type PlanInput = {
  days: DayFrame[];
  busy: Interval[];
  tasks: PlanTask[];
  now: number;
  blockMinutes?: number;
  minBlockMinutes?: number;
  breakMinutes?: number;
  bufferMinutes?: number;
  maxBlocksPerTaskPerDay?: number;
};

export type PlannedBlock = { taskId: string; title: string; start: number; end: number; minutes: number; dateKey: string };

export type DaySummary = { dateKey: string; freeMinutes: number; capMinutes: number; existingMinutes: number; plannedMinutes: number };

export type PlanResult = {
  blocks: PlannedBlock[];
  days: DaySummary[];
  overflow: { taskId: string; title: string; minutes: number; dueAt: number | null }[];
  neededMinutes: number;
  placedMinutes: number;
};

const MIN = 60_000;
const roundUp = (t: number, step = 5 * MIN) => Math.ceil(t / step) * step;

/** Removes `cut` intervals from `base` intervals. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let out = base.map((b) => ({ ...b }));
  for (const c of cut) {
    const next: Interval[] = [];
    for (const b of out) {
      if (c.end <= b.start || c.start >= b.end) next.push(b);
      else {
        if (c.start > b.start) next.push({ start: b.start, end: c.start });
        if (c.end < b.end) next.push({ start: c.end, end: b.end });
      }
    }
    out = next;
  }
  return out.filter((i) => i.end > i.start);
}

export function planSchedule(input: PlanInput): PlanResult {
  const block = input.blockMinutes ?? 45;
  const minBlock = input.minBlockMinutes ?? 20;
  const pause = input.breakMinutes ?? 10;
  const buffer = input.bufferMinutes ?? 10;
  const perDay = input.maxBlocksPerTaskPerDay ?? 2;
  const earliest = roundUp(input.now + 15 * MIN);
  const busy = input.busy.map((b) => ({ start: b.start - buffer * MIN, end: b.end + buffer * MIN }));

  const days = input.days.map((d) => {
    const free = d.windows
      .map((w) => {
        const pieces = subtractIntervals([{ start: Math.max(w.start, earliest), end: w.end }], busy);
        return pieces.map((p) => ({ start: roundUp(p.start), end: p.end, pref: w.pref }));
      })
      .flat()
      .filter((p) => p.end - p.start >= minBlock * MIN)
      .sort((a, b) => b.pref - a.pref || a.start - b.start);
    const freeMinutes = Math.round(free.reduce((s, f) => s + (f.end - f.start), 0) / MIN);
    return { frame: d, free, capLeft: Math.max(0, d.capMinutes - d.existingMinutes), freeMinutes, planned: 0 };
  });

  const order = input.tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.dueAt ?? Infinity) - (b.t.dueAt ?? Infinity) || b.t.priority - a.t.priority || a.i - b.i)
    .map((x) => x.t);

  const blocks: PlannedBlock[] = [];
  const overflow: PlanResult["overflow"] = [];
  for (const task of order) {
    let remaining = Math.max(0, Math.round(task.minutes));
    for (const day of days) {
      if (remaining <= 0) break;
      let used = 0;
      for (const slot of day.free) {
        while (remaining > 0 && used < perDay && day.capLeft > 0) {
          const room = (slot.end - slot.start) / MIN;
          let len = Math.min(block, remaining, day.capLeft, room);
          // Don't leave a scrap smaller than a useful block: take it now if it fits.
          const leftover = remaining - len;
          if (leftover > 0 && leftover < minBlock && remaining <= Math.min(room, day.capLeft, block + minBlock)) len = remaining;
          if (task.dueAt != null) len = Math.min(len, (task.dueAt - slot.start) / MIN);
          len = Math.floor(len / 5) * 5;
          const acceptable = len >= minBlock || (len >= 10 && len >= remaining);
          if (!acceptable) break;
          blocks.push({ taskId: task.id, title: task.title, start: slot.start, end: slot.start + len * MIN, minutes: len, dateKey: day.frame.dateKey });
          slot.start += (len + pause) * MIN;
          remaining -= len;
          day.capLeft -= len;
          day.planned += len;
          used++;
        }
        if (remaining <= 0 || used >= perDay || day.capLeft <= 0) break;
      }
    }
    if (remaining > 0) overflow.push({ taskId: task.id, title: task.title, minutes: remaining, dueAt: task.dueAt });
  }

  blocks.sort((a, b) => a.start - b.start);
  const neededMinutes = order.reduce((s, t) => s + Math.max(0, Math.round(t.minutes)), 0);
  return {
    blocks,
    days: days.map((d) => ({ dateKey: d.frame.dateKey, freeMinutes: d.freeMinutes, capMinutes: d.frame.capMinutes, existingMinutes: d.frame.existingMinutes, plannedMinutes: d.planned })),
    overflow,
    neededMinutes,
    placedMinutes: neededMinutes - overflow.reduce((s, o) => s + o.minutes, 0),
  };
}

/**
 * The student's pace: median of actual ÷ planned minutes over completed sessions, clamped to
 * 0.6–2. Needs at least three sessions; otherwise 1 (no adjustment).
 */
export function paceFactor(sessions: { plannedMinutes: number | null; actualMinutes: number | null }[]): { factor: number; basedOn: number } {
  const ratios = sessions
    .filter((s) => s.plannedMinutes && s.actualMinutes && s.plannedMinutes >= 10)
    .map((s) => s.actualMinutes! / s.plannedMinutes!)
    .sort((a, b) => a - b);
  if (ratios.length < 3) return { factor: 1, basedOn: ratios.length };
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { factor: Math.min(2, Math.max(0.6, Math.round(median * 100) / 100)), basedOn: ratios.length };
}

/** Parts of the day used for preferences and missed-session patterns. */
export const DAY_PARTS = [
  { id: "EARLY_MORNING", label: "early morning", start: "05:30", end: "07:30" },
  { id: "MORNING", label: "morning", start: "07:30", end: "12:00" },
  { id: "AFTERNOON", label: "afternoon", start: "12:00", end: "17:00" },
  { id: "EVENING", label: "evening", start: "17:00", end: "21:00" },
  { id: "NIGHT", label: "night", start: "21:00", end: "23:30" },
] as const;
export type DayPartId = (typeof DAY_PARTS)[number]["id"];

export function dayPartOf(localMinutes: number): DayPartId {
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  for (const p of DAY_PARTS) if (localMinutes >= toMin(p.start) && localMinutes < toMin(p.end)) return p.id;
  return "NIGHT";
}
