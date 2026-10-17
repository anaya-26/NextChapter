import { describe, expect, it } from "vitest";
import { allowedAudiences } from "@/lib/age";
import { autoHideThreshold, contactInfoReason, handleProblem, slugify } from "@/lib/community-safety";

describe("community safety rules", () => {
  it("blocks contact details and off-platform invitations", () => {
    expect(contactInfoReason("Call 98765 43210 for notes")).toBe("phone numbers");
    expect(contactInfoReason("my number is +91-9876543210")).toBe("phone numbers");
    expect(contactInfoReason("mail me at asha.p@gmail.com")).toBe("email addresses");
    expect(contactInfoReason("add me on WhatsApp")).toBe("messaging or social media contacts");
    expect(contactInfoReason("join t.me/physicsgroup")).toBe("messaging or social media contacts");
    expect(contactInfoReason("Newton's second law: F = ma. In 2024 the syllabus changed for 12th.")).toBeNull();
    expect(contactInfoReason("The answer is 6.022 × 10^23 and the year was 1857")).toBeNull();
  });

  it("keeps handles pseudonymous and safe", () => {
    expect(handleProblem("physics_fan")).toBeNull();
    expect(handleProblem("ab")).toMatch(/3–20/);
    expect(handleProblem("asha patil")).toMatch(/3–20/);
    expect(handleProblem("roll1234567")).toMatch(/numbers/);
    expect(handleProblem("Moderator_1")).toMatch(/reserved/);
  });

  it("separates spaces by age band", () => {
    expect(allowedAudiences("UNDER_13")).toEqual(["ALL_AGES"]);
    expect(allowedAudiences("TEEN_16_17")).toEqual(["ALL_AGES", "TEENS"]);
    expect(allowedAudiences("ADULT")).toEqual(["ALL_AGES", "ADULTS"]);
    expect(allowedAudiences("UNDISCLOSED")).toEqual(["ALL_AGES"]);
    expect(autoHideThreshold("ALL_AGES")).toBeLessThan(autoHideThreshold("ADULTS"));
  });

  it("makes URL-safe group slugs", () => {
    expect(slugify("JEE Main & Advanced — 2027!")).toBe("jee-main-advanced-2027");
  });
});
