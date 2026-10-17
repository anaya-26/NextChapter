import { describe, expect, it } from "vitest";
import { isPublicAddress, unsafeUrlReason } from "@/lib/ip";
import { coverage, deadlineState, introducesNewNumbers, isEligibilityRequirement, parsePostingText } from "@/lib/opportunity-text";
import { OPPORTUNITY_DIRECTORY } from "@/lib/opportunity-directory";
import { zonedToUtc } from "@/lib/time";

const NOW = zonedToUtc("2026-10-17", "10:00", "Asia/Kolkata");

describe("private-network guard", () => {
  it("allows only public addresses", () => {
    for (const ip of ["8.8.8.8", "142.250.183.14", "2606:4700:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.1.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "224.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("rejects risky URLs before any lookup", () => {
    expect(unsafeUrlReason("https://internship.aicte-india.org/")).toBeNull();
    expect(unsafeUrlReason("ftp://example.org/x")).toMatch(/http/);
    expect(unsafeUrlReason("http://localhost:3000/")).toMatch(/Local|ports/);
    expect(unsafeUrlReason("http://169.254.169.254/latest/meta-data")).toMatch(/Private/);
    expect(unsafeUrlReason("http://[::1]/")).toMatch(/Private/);
    expect(unsafeUrlReason("https://user:pw@example.org/")).toMatch(/credentials/);
    expect(unsafeUrlReason("https://example.org:6379/")).toMatch(/ports/);
    expect(unsafeUrlReason("http://intranet/")).toMatch(/Local/);
  });
});

describe("reading a pasted posting", () => {
  const posting = `Data Analyst Intern
Company: Acme Analytics Pvt Ltd
Location: Pune (Hybrid)
Duration: 3 months
Stipend: ₹12,000 per month
Apply by 30 Nov 2026

Skills required:
- Python
- SQL
- Excel or Google Sheets
- Good communication

Who can apply: Students in 3rd or 4th year of B.Tech/B.Sc`;

  it("copies stated details and leaves the rest empty", () => {
    const d = parsePostingText(posting, NOW, "Asia/Kolkata");
    expect(d).toMatchObject({ title: "Data Analyst Intern", organisation: "Acme Analytics Pvt Ltd", kind: "INTERNSHIP", workMode: "HYBRID", duration: "3 months", compensation: "₹12,000 per month", deadlineKey: "2026-11-30" });
    expect(d.location).toBe("Pune (Hybrid)");
    expect(d.requirements).toEqual(["Python", "SQL", "Excel or Google Sheets", "Good communication"]);
    expect(d.eligibility).toMatch(/3rd or 4th year/);
  });

  it("doesn't invent a deadline or stipend", () => {
    const d = parsePostingText("Open source mentorship programme\nWork remotely with mentors.", NOW, "Asia/Kolkata");
    expect(d.deadlineKey).toBeNull();
    expect(d.compensation).toBeNull();
    expect(d.kind).toBe("PROGRAMME");
    expect(d.workMode).toBe("REMOTE");
  });

  it("reads day-first numeric deadlines", () => {
    expect(parsePostingText("Hackathon\nLast date: 05/12/2026", NOW, "Asia/Kolkata").deadlineKey).toBe("2026-12-05");
  });
});

describe("requirements and evidence", () => {
  it("separates eligibility from skills", () => {
    for (const r of ["Age 21–24", "Enrolled in an undergraduate course", "Minimum 60% in Class 12", "Not in full-time education or employment", "Aadhaar-linked bank account"]) expect(isEligibilityRequirement(r), r).toBe(true);
    for (const r of ["Python", "Git and collaborative coding", "Report writing", "Basic electronics"]) expect(isEligibilityRequirement(r), r).toBe(false);
  });

  it("measures keyword coverage", () => {
    expect(coverage("Python", "Built a logger in Python")).toBe(1);
    expect(coverage("Git and collaborative coding", "Python, Basic electronics")).toBe(0);
    expect(coverage("Data plotting", "data plotting and charts")).toBe(1);
  });

  it("tracks deadline states", () => {
    expect(deadlineState(null, NOW)).toBe("UNKNOWN");
    expect(deadlineState(new Date(NOW.getTime() - 1000), NOW)).toBe("CLOSED");
    expect(deadlineState(new Date(NOW.getTime() + 3 * 86400000), NOW)).toBe("CLOSING_SOON");
    expect(deadlineState(new Date(NOW.getTime() + 30 * 86400000), NOW)).toBe("OPEN");
  });

  it("flags CV rewrites that add figures", () => {
    const source = "Helped four Class 9 students with Python basics for six weeks. All 4 completed their assignments.";
    expect(introducesNewNumbers("Taught Python to 4 Class 9 students over six weeks", source)).toEqual([]);
    expect(introducesNewNumbers("Taught Python to 25 students, improving scores by 40%", source)).toEqual(["25", "40"]);
  });
});

describe("official directory", () => {
  it("has unique ids, https source links and no invented deadlines", () => {
    const ids = OPPORTUNITY_DIRECTORY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of OPPORTUNITY_DIRECTORY) {
      expect(d.sourceUrl, d.id).toMatch(/^https:\/\//);
      expect(d.deadlineText.length, d.id).toBeGreaterThan(3);
      expect(d.stages.length, d.id).toBeGreaterThan(0);
    }
  });
});
