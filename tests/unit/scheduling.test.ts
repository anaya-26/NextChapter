import { describe, expect, it } from "vitest";
import { parseScheduleText } from "@/lib/nl-schedule";
import { dayPartOf, paceFactor, planSchedule, subtractIntervals, type DayFrame } from "@/lib/planner";
import { describeRule, expandOccurrences, weeklyRule } from "@/lib/recurrence";
import { zonedToUtc } from "@/lib/time";

const TZ = "Asia/Kolkata";
// Saturday 17 Oct 2026, 4:30 pm IST
const NOW = zonedToUtc("2026-10-17", "16:30", TZ);

describe("natural-language scheduling", () => {
  it("reads a revision with a relative day, time and duration", () => {
    const d = parseScheduleText("Physics revision tomorrow 7pm for 45 min", NOW, TZ)!;
    expect(d).toMatchObject({ title: "Physics revision", kind: "REVISION", dateKey: "2026-10-18", startTime: "19:00", durationMinutes: 45, recurrence: null });
  });

  it("reads Indian day-first dates and marks tests with a countdown", () => {
    const d = parseScheduleText("Chemistry test on 23/10 at 10am", NOW, TZ)!;
    expect(d).toMatchObject({ title: "Chemistry test", kind: "EXAM", dateKey: "2026-10-23", startTime: "10:00", showCountdown: true });
  });

  it("treats due dates without a time as end-of-day deadlines", () => {
    const d = parseScheduleText("Maths assignment due Friday", NOW, TZ)!;
    expect(d).toMatchObject({ kind: "ASSIGNMENT", dateKey: "2026-10-23", startTime: "23:59", isDeadline: true });
    expect(d.title).toBe("Maths assignment");
    expect(d.assumptions.join(" ")).toMatch(/11:59 pm/);
  });

  it("reads weekly classes with a time range", () => {
    const d = parseScheduleText("Coaching every Monday and Wednesday 5-7pm", NOW, TZ)!;
    expect(d.kind).toBe("CLASS");
    expect(d.recurrence).toEqual({ freq: "WEEKLY", days: [1, 3], untilKey: null });
    expect(d.startTime).toBe("17:00");
    expect(d.durationMinutes).toBe(120);
    expect(d.title).toBe("Coaching");
  });

  it("understands common Hindi words", () => {
    const d = parseScheduleText("kal shaam 7 baje physics padhai", NOW, TZ)!;
    expect(d).toMatchObject({ dateKey: "2026-10-18", startTime: "19:00" });
    const ambiguous = parseScheduleText("kal 6 baje chemistry", NOW, TZ)!;
    expect(ambiguous.startTime).toBe("18:00");
    expect(ambiguous.assumptions.join(" ")).toMatch(/evening/);
  });
});

describe("recurrence", () => {
  it("keeps weekly events at the same local time", () => {
    const start = zonedToUtc("2026-10-19", "17:00", TZ); // Monday
    const occurrences = expandOccurrences(
      { startAt: start, endAt: new Date(start.getTime() + 2 * 3600_000), rrule: weeklyRule([1, 3]), timezone: TZ },
      zonedToUtc("2026-10-19", "00:00", TZ),
      zonedToUtc("2026-10-26", "00:00", TZ),
    );
    expect(occurrences.map((o) => o.start.toISOString())).toEqual(["2026-10-19T11:30:00.000Z", "2026-10-21T11:30:00.000Z"]);
    expect(describeRule(weeklyRule([1, 3], "2026-12-31"))).toBe("Every Mon, Wed until 31/12/2026");
  });

  it("respects daylight-saving changes in other time zones", () => {
    const tz = "Europe/London";
    const start = zonedToUtc("2026-10-20", "18:00", tz); // BST (UTC+1)
    const occ = expandOccurrences({ startAt: start, endAt: new Date(start.getTime() + 3600_000), rrule: weeklyRule([2]), timezone: tz }, start, new Date(start.getTime() + 14 * 86400_000));
    expect(occ.map((o) => o.start.toISOString())).toEqual(["2026-10-20T17:00:00.000Z", "2026-10-27T18:00:00.000Z"]); // GMT after 25 Oct
  });
});

describe("planner", () => {
  const day = (dateKey: string, cap = 120, existing = 0): DayFrame => ({
    dateKey,
    windows: [
      { start: zonedToUtc(dateKey, "17:00", TZ).getTime(), end: zonedToUtc(dateKey, "21:00", TZ).getTime(), pref: 2 },
      { start: zonedToUtc(dateKey, "06:00", TZ).getTime(), end: zonedToUtc(dateKey, "08:00", TZ).getTime(), pref: 1 },
    ],
    capMinutes: cap,
    existingMinutes: existing,
  });

  it("subtracts busy time", () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 20, end: 30 }, { start: 90, end: 120 }])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 90 },
    ]);
  });

  it("fits work around a class with breaks, buffers and a daily cap, earliest deadline first", () => {
    const sun = "2026-10-18";
    const classBusy = { start: zonedToUtc(sun, "18:00", TZ).getTime(), end: zonedToUtc(sun, "19:00", TZ).getTime() };
    const r = planSchedule({
      now: NOW.getTime(),
      days: [day(sun), day("2026-10-19")],
      busy: [classBusy],
      tasks: [
        { id: "a", title: "Ohm's law", minutes: 90, dueAt: null, priority: 1, kind: "TOPIC" },
        { id: "b", title: "Lab record", minutes: 40, dueAt: zonedToUtc("2026-10-19", "09:00", TZ).getTime(), priority: 1, kind: "ASSIGNMENT" },
      ],
    });
    expect(r.overflow).toEqual([]);
    // The deadline task is placed first (Sunday evening, before the class buffer).
    const first = r.blocks[0];
    expect(first.taskId).toBe("b");
    expect(new Date(first.start).toISOString()).toBe(zonedToUtc(sun, "17:00", TZ).toISOString());
    // Nothing overlaps the class or its 10-minute buffers.
    for (const b of r.blocks) expect(b.end <= classBusy.start - 600_000 || b.start >= classBusy.end + 600_000).toBe(true);
    // Daily cap respected.
    for (const d of r.days) expect(d.plannedMinutes).toBeLessThanOrEqual(d.capMinutes);
    expect(r.placedMinutes).toBe(130);
  });

  it("doesn't leave short scraps of work", () => {
    const r = planSchedule({
      now: NOW.getTime(),
      days: [day("2026-10-18")],
      busy: [],
      tasks: [{ id: "a", title: "Assignment", minutes: 60, dueAt: null, priority: 1, kind: "ASSIGNMENT" }],
    });
    expect(r.blocks.map((b) => b.minutes)).toEqual([60]);
  });

  it("reports overflow when work can't fit before a deadline", () => {
    const r = planSchedule({
      now: NOW.getTime(),
      days: [day("2026-10-18", 60)],
      busy: [],
      tasks: [{ id: "x", title: "Big project", minutes: 200, dueAt: zonedToUtc("2026-10-19", "00:00", TZ).getTime(), priority: 1, kind: "ASSIGNMENT" }],
    });
    // 45 minutes fit; a 15-minute scrap under the cap is too short to be useful.
    expect(r.overflow).toEqual([{ taskId: "x", title: "Big project", minutes: 155, dueAt: expect.any(Number) }]);
  });

  it("learns the student's pace only from enough history", () => {
    expect(paceFactor([{ plannedMinutes: 45, actualMinutes: 60 }])).toEqual({ factor: 1, basedOn: 1 });
    expect(paceFactor([45, 45, 30, 60].map((p) => ({ plannedMinutes: p, actualMinutes: p * 1.4 }))).factor).toBe(1.4);
    expect(dayPartOf(7 * 60)).toBe("EARLY_MORNING");
    expect(dayPartOf(19 * 60)).toBe("EVENING");
  });
});
