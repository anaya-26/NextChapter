import { describe, expect, it } from "vitest";
import { cappedPoints, levelForXp, sessionPoints } from "@/lib/xp-rules";
import { commitmentSchema, goalSchema } from "@/lib/validation";
import { formToObject } from "@/lib/action";
import { allowedAudiences, isMinorBand } from "@/lib/age";

describe("XP rules", () => {
  it("only counts focused sessions of 10+ minutes, capped at 24 XP", () => {
    expect(sessionPoints(5)).toBe(0);
    expect(sessionPoints(9)).toBe(0);
    expect(sessionPoints(10)).toBe(2);
    expect(sessionPoints(47)).toBe(9);
    expect(sessionPoints(300)).toBe(24);
  });

  it("computes levels with growing thresholds", () => {
    expect(levelForXp(0)).toMatchObject({ level: 1, start: 0, next: 100 });
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(300)).toMatchObject({ level: 3, start: 300, next: 600 });
    expect(levelForXp(450).progress).toBeCloseTo(0.5);
  });

  it("applies daily caps", () => {
    expect(cappedPoints(10, 0, 50)).toBe(10);
    expect(cappedPoints(10, 45, 50)).toBe(5);
    expect(cappedPoints(10, 50, 50)).toBe(0);
    expect(cappedPoints(10, 999)).toBe(10);
  });
});

describe("form validation", () => {
  it("parses repeated form keys and validates commitments", () => {
    const fd = new FormData();
    fd.set("title", "Coaching");
    fd.set("kind", "COACHING");
    fd.append("daysOfWeek", "1");
    fd.append("daysOfWeek", "3");
    fd.set("startTime", "17:00");
    fd.set("endTime", "17:00");
    const r = commitmentSchema.safeParse(formToObject(fd, ["daysOfWeek"]));
    expect(r.success).toBe(false);
    fd.set("endTime", "19:30");
    const ok = commitmentSchema.parse(formToObject(fd, ["daysOfWeek"]));
    expect(ok.daysOfWeek).toEqual([1, 3]);
  });

  it("rejects malformed goal dates", () => {
    expect(goalSchema.safeParse({ title: "Learn Python", horizon: "SHORT", category: "SKILL", targetDate: "31/12/2026" }).success).toBe(false);
    expect(goalSchema.parse({ title: "Learn Python", horizon: "SHORT", category: "SKILL", targetDate: "" }).targetDate).toBeNull();
  });
});

describe("age protections", () => {
  it("treats under-18 bands as minors and restricts community audiences", () => {
    expect(isMinorBand("TEEN_16_17")).toBe(true);
    expect(isMinorBand("ADULT")).toBe(false);
    expect(allowedAudiences("TEEN_13_15")).toEqual(["ALL_AGES", "TEENS"]);
    expect(allowedAudiences("ADULT")).toEqual(["ALL_AGES", "ADULTS"]);
    expect(allowedAudiences("UNDISCLOSED")).toEqual(["ALL_AGES"]);
  });
});
