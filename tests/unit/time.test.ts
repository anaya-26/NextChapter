import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  daysBetweenKeys,
  formatHm,
  localDateKey,
  localTimeKey,
  parseHm,
  tzOffsetMinutes,
  weekStartKey,
  zonedToUtc,
} from "@/lib/time";

describe("timezone helpers", () => {
  it("knows India Standard Time is UTC+5:30 all year", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes(new Date("2026-07-15T00:00:00Z"), "Asia/Kolkata")).toBe(330);
  });

  it("converts an IST wall-clock time to the right UTC instant", () => {
    expect(zonedToUtc("2026-10-17", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-10-17T03:30:00.000Z");
    // Crossing midnight: 02:00 IST is the previous UTC day.
    expect(zonedToUtc("2026-10-17", "02:00", "Asia/Kolkata").toISOString()).toBe("2026-10-16T20:30:00.000Z");
  });

  it("handles a daylight-saving timezone (New York) around the DST change", () => {
    expect(zonedToUtc("2026-03-07", "12:00", "America/New_York").toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(zonedToUtc("2026-03-09", "12:00", "America/New_York").toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("derives the local date and time of an instant", () => {
    const instant = new Date("2026-10-16T20:30:00Z");
    expect(localDateKey(instant, "Asia/Kolkata")).toBe("2026-10-17");
    expect(localTimeKey(instant, "Asia/Kolkata")).toBe("02:00");
    expect(localDateKey(instant, "UTC")).toBe("2026-10-16");
  });

  it("does date-key arithmetic", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetweenKeys("2026-10-01", "2026-10-17")).toBe(16);
    expect(weekStartKey("2026-10-18")).toBe("2026-10-12"); // Sunday → previous Monday
    expect(weekStartKey("2026-10-12")).toBe("2026-10-12");
  });

  it("parses and formats HH:MM", () => {
    expect(parseHm("07:45")).toBe(465);
    expect(formatHm(465)).toBe("07:45");
    expect(formatHm(1440 + 30)).toBe("00:30");
  });
});
