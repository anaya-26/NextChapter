import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import "@/server/ai/mock-registry";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { registerMockResponder } from "@/server/ai/mock-responders";
import { setSafeFetchOverride } from "@/server/net";
import { zonedToUtc } from "@/lib/time";
import { updateProfile } from "@/server/services/profile";
import { upsertCareerInterest } from "@/server/services/goals";
import { createSubject } from "@/server/services/subjects";
import { addManualOpportunity, checkOpportunityLinks, ensureDirectory, expireOpportunities, getOpportunity, listOpportunities, refreshFeeds } from "@/server/services/opportunities";
import { analyseGaps, answerInterview, getApplication, interviewQuestions, planForGap, setRequirementState, updateApplication } from "@/server/services/applications";
import { approveAchievement, createAchievement, skillsOverview, updateAchievement, type AchievementInput } from "@/server/services/portfolio";
import { createCv, cvDocument, cvToText, getCv, readSections, resolveSuggestion, tailorCv } from "@/server/services/cv";
import { createTestUser } from "../helpers/db";

const TZ = "Asia/Kolkata";
const AT = zonedToUtc("2026-10-17", "10:00", TZ);

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  resetEnvCache();
  resetAiProvider();
}

const POSTING = `Embedded Systems Intern
Company: Example Devices Pvt Ltd
Location: Bengaluru
Duration: 2 months
Stipend: ₹10,000 per month
Apply by 15 Nov 2026

Skills required:
- Python
- Basic electronics
- Git and collaborative coding
- Enrolled in a B.Tech or B.Sc programme`;

const achievement = (over: Partial<AchievementInput> = {}): AchievementInput => ({
  kind: "PROJECT",
  title: "Room temperature logger",
  organisation: null,
  role: null,
  startMonth: "2026-06",
  endMonth: "2026-07",
  description: "Built a sensor circuit and a Python script that logs room temperature every minute.",
  outcomes: "Logged 7 days of readings and presented them at the science club.",
  skills: ["Python", "Basic electronics"],
  subjects: ["Physics"],
  evidenceLinks: ["https://example.org/logger"],
  ...over,
});

beforeAll(() => useProvider("mock"));
afterEach(() => setSafeFetchOverride(null));

describe("opportunities", () => {
  it("ranks the official directory by stage and interests, with reasons", async () => {
    await ensureDirectory();
    await ensureDirectory();
    expect(await prisma.opportunity.count({ where: { sourceType: "DIRECTORY" } })).toBeGreaterThanOrEqual(15);

    const { id } = await createTestUser();
    await updateProfile(id, { educationStage: "UNDERGRADUATE" });
    await upsertCareerInterest(id, { domain: "Software engineering", roles: [], companies: [], cities: [], workModes: ["REMOTE"], status: "SELECTED", notes: null });
    const list = await listOpportunities(id, {}, AT);
    const gsoc = list.find((o) => o.id === "dir_gsoc")!;
    expect(gsoc.reasons).toEqual(expect.arrayContaining(["Fits your education stage", "Matches your interest in Software engineering", "Remote, as you prefer"]));
    expect(list.indexOf(gsoc)).toBeLessThan(5);
    expect(list.some((o) => o.id === "dir_inspire_manak")).toBe(false); // school-only
    expect((await listOpportunities(id, { allStages: true }, AT)).some((o) => o.id === "dir_inspire_manak")).toBe(true);

    const school = await createTestUser("School");
    await updateProfile(school.id, { educationStage: "SCHOOL" });
    const schoolList = await listOpportunities(school.id, {}, AT);
    expect(schoolList.map((o) => o.id)).toContain("dir_hbcse_olympiads");
    expect(schoolList.map((o) => o.id)).not.toContain("dir_pm_internship");
  });

  it("saves a pasted posting privately, with a calendar deadline and countdown", async () => {
    const { id } = await createTestUser();
    const { opportunity, application, readBy } = await addManualOpportunity(id, { sourceUrl: "https://example.org/jobs/embedded-intern", postingText: POSTING, title: null, organisation: null, kind: null, location: null, workMode: null, deadline: null, compensation: null }, AT);
    expect(readBy).toBe("MOCK");
    expect(opportunity).toMatchObject({ title: "Embedded Systems Intern", organisation: "Example Devices Pvt Ltd", kind: "INTERNSHIP", compensation: "₹10,000 per month", sourceType: "MANUAL", ownerId: id, verification: "UNVERIFIED" });
    expect(opportunity.deadline?.toISOString()).toBe(zonedToUtc("2026-11-15", "23:59", TZ).toISOString());
    expect(opportunity.requirements).toHaveLength(4);
    const event = await prisma.calendarEvent.findFirstOrThrow({ where: { applicationId: application.id } });
    expect(event).toMatchObject({ kind: "APPLICATION", isDeadline: true, showCountdown: true });

    const other = await createTestUser("Other");
    expect(await getOpportunity(other.id, opportunity.id)).toBeNull();
    expect((await listOpportunities(other.id, { allStages: true, includeClosed: true }, AT)).some((o) => o.id === opportunity.id)).toBe(false);
  });

  it("records link checks honestly and expires closed openings", async () => {
    const { id } = await createTestUser();
    const add = (url: string, deadline: string | null) => addManualOpportunity(id, { sourceUrl: url, postingText: null, title: "Test opening", organisation: "Org", kind: "INTERNSHIP", location: null, workMode: null, deadline, compensation: null }, AT);
    const ok = (await add("https://example.org/ok", "2026-12-01")).opportunity;
    const gone = (await add("https://example.org/gone", "2026-12-01")).opportunity;
    const flaky = (await add("https://example.org/flaky", "2026-10-20")).opportunity;
    setSafeFetchOverride(async (url) => {
      if (url.endsWith("/flaky")) throw new Error("ECONNRESET");
      return { status: url.endsWith("/gone") ? 404 : 200, ok: !url.endsWith("/gone"), url, contentType: "text/html", body: null };
    });
    await checkOpportunityLinks([ok.id, gone.id, flaky.id], AT);
    const after = await prisma.opportunity.findMany({ where: { id: { in: [ok.id, gone.id, flaky.id] } } });
    const by = (x: string) => after.find((o) => o.id === x)!;
    expect(by(ok.id)).toMatchObject({ verification: "SOURCE_LINKED", linkStatus: "REACHABLE" });
    expect(by(ok.id).lastCheckedAt?.toISOString()).toBe(AT.toISOString());
    expect(by(gone.id)).toMatchObject({ verification: "LINK_BROKEN" });
    expect(by(flaky.id)).toMatchObject({ verification: "UNVERIFIED", lastCheckedAt: null });

    const later = new Date(AT.getTime() + 5 * 86400000);
    expect(await expireOpportunities(later)).toBeGreaterThanOrEqual(1);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: flaky.id } })).verification).toBe("EXPIRED");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: "dir_gsoc" } })).verification).not.toBe("EXPIRED");
    expect((await listOpportunities(id, { allStages: true }, later)).some((o) => o.id === flaky.id)).toBe(false);
    expect((await listOpportunities(id, { allStages: true, includeClosed: true, q: "Test opening" }, later)).find((o) => o.id === flaky.id)?.deadlineState).toBe("CLOSED");
  });

  it("imports permitted RSS feeds without duplicates", async () => {
    process.env.OPPORTUNITY_FEEDS = JSON.stringify([{ name: "Test feed", url: "https://feeds.example.org/opps.xml", format: "rss", permittedNote: "Test fixture" }]);
    resetEnvCache();
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Opps</title>
      <item><title>Research internship in ecology</title><link>https://feeds.example.org/1</link><guid>opp-1</guid><description>Remote research internship. Apply by 10 Dec 2026. Stipend: ₹5,000 per month</description></item>
      <item><title>Design sprint competition</title><link>https://feeds.example.org/2</link><guid>opp-2</guid><description>On-site in Mumbai.</description></item>
    </channel></rss>`;
    setSafeFetchOverride(async (url) => ({ status: 200, ok: true, url, contentType: "application/rss+xml", body: rss }));
    try {
      expect(await refreshFeeds(AT)).toEqual([{ feed: "Test feed", items: 2 }]);
      await refreshFeeds(AT);
      const items = await prisma.opportunity.findMany({ where: { sourceType: "FEED" }, orderBy: { title: "asc" } });
      expect(items).toHaveLength(2);
      expect(items[1]).toMatchObject({ title: "Research internship in ecology", kind: "INTERNSHIP", workMode: "REMOTE", compensation: "₹5,000 per month", sourceName: "Test feed", ownerId: null });
      expect(items[1].deadline?.toISOString().slice(0, 10)).toBe("2026-12-10");
      expect(items[0]).toMatchObject({ kind: "COMPETITION", deadline: null, deadlineText: "Not stated in the feed — check the source" });
    } finally {
      delete process.env.OPPORTUNITY_FEEDS;
      resetEnvCache();
    }
  });
});

describe("applications", () => {
  it("finds gaps from approved evidence only, keeps 'studied' separate, and turns a gap into a plan", async () => {
    const { id } = await createTestUser();
    const subject = await createSubject(id, { name: "Git and version control" });
    await prisma.studySession.create({ data: { userId: id, subjectId: subject.id, status: "COMPLETED", startedAt: AT, actualMinutes: 120 } });
    const approved = await createAchievement(id, achievement(), [], AT);
    await approveAchievement(id, approved.id, AT);
    await createAchievement(id, achievement({ title: "Draft: report writing club", skills: ["Report writing"], evidenceLinks: [] }), [], AT); // not approved
    const { application } = await addManualOpportunity(id, { sourceUrl: "https://example.org/x", postingText: POSTING, title: null, organisation: null, kind: null, location: null, workMode: null, deadline: null, compensation: null }, AT);

    const r = await analyseGaps(id, application.id);
    expect(r.by).toBe("MOCK");
    const row = (req: string) => r.rows.find((x) => x.requirement === req)!;
    expect(row("Python")).toMatchObject({ state: "MET", achievementIds: [approved.id] });
    expect(row("Basic electronics").state).toBe("MET");
    expect(row("Git and collaborative coding")).toMatchObject({ state: "GAP" });
    expect(row("Git and collaborative coding").explanation).toMatch(/studied Git and version control .* haven’t shown it/);
    expect(row("Enrolled in a B.Tech or B.Sc programme").state).toBe("UNKNOWN");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("PREPARING");

    // The student's own decision survives a re-run.
    await setRequirementState(id, row("Enrolled in a B.Tech or B.Sc programme").id, "MET");
    const again = await analyseGaps(id, application.id);
    expect(again.rows.find((x) => x.requirement.startsWith("Enrolled"))).toMatchObject({ state: "MET", decidedBy: "STUDENT" });

    const plan = await planForGap(id, row("Git and collaborative coding").id, AT);
    expect(plan.created).toBe(true);
    expect(plan.goal).toMatchObject({ category: "SKILL", requirementId: row("Git and collaborative coding").id });
    expect(await prisma.milestone.count({ where: { goalId: plan.goal.id } })).toBe(3);
    expect(await prisma.calendarEvent.findFirst({ where: { goalId: plan.goal.id, kind: "PROJECT" } })).not.toBeNull();
    expect((await planForGap(id, row("Git and collaborative coding").id, AT)).created).toBe(false);

    const other = await createTestUser("Other");
    await expect(analyseGaps(other.id, application.id)).rejects.toThrow(/not found/);
    await expect(planForGap(other.id, row("Python").id, AT)).rejects.toThrow(/not found/);
  });

  it("tracks status and turns a dated next step into a calendar reminder", async () => {
    const { id } = await createTestUser();
    const { application } = await addManualOpportunity(id, { sourceUrl: "https://example.org/y", postingText: null, title: "Design internship", organisation: "Studio", kind: "INTERNSHIP", location: null, workMode: null, deadline: null, compensation: null }, AT);
    await updateApplication(id, application.id, { status: "APPLIED", notes: "Sent portfolio", nextStep: "Follow up by email", nextStepDate: "2026-10-24", cvId: null }, AT);
    let app = await getApplication(id, application.opportunityId);
    expect(app).toMatchObject({ status: "APPLIED", notes: "Sent portfolio" });
    expect(app?.appliedAt?.toISOString()).toBe(AT.toISOString());
    expect(app?.calendarEvents.filter((e) => e.kind === "REMINDER")).toHaveLength(1);
    await updateApplication(id, application.id, { status: "INTERVIEWING", notes: null, nextStep: "Interview prep", nextStepDate: "2026-10-27", cvId: null }, AT);
    app = await getApplication(id, application.opportunityId);
    const reminders = app!.calendarEvents.filter((e) => e.kind === "REMINDER");
    expect(reminders.map((e) => e.title)).toEqual(["Design internship: Interview prep"]);
    expect(app?.appliedAt?.toISOString()).toBe(AT.toISOString());
  });

  it("practises interviews with labelled feedback, and rule-based feedback without AI", async () => {
    const { id } = await createTestUser();
    const a = await createAchievement(id, achievement(), [], AT);
    await approveAchievement(id, a.id, AT);
    const qs = await interviewQuestions(id, null);
    expect(qs.some((q) => q.achievementId === a.id)).toBe(true);
    const mock = await answerInterview(id, { applicationId: null, question: qs[0].question, answer: "I am a second-year student who enjoys building small electronics projects.", achievementId: null }, AT);
    expect(mock.feedback.by).toBe("MOCK");
    useProvider("none");
    try {
      const rules = await answerInterview(id, { applicationId: null, question: "Walk me through the logger.", answer: "We made a logger for the science club and it was fun to build with my friends.", achievementId: a.id }, AT);
      expect(rules.feedback.by).toBe("RULES");
      expect(rules.feedback.improvements.join(" ")).toMatch(/use “I”/);
    } finally {
      useProvider("mock");
    }
  });
});

describe("portfolio and CV", () => {
  it("needs approval to reach a CV, gives XP once only with evidence, and re-asks after edits", async () => {
    const { id } = await createTestUser();
    const noEvidence = await createAchievement(id, achievement({ title: "Class representative", kind: "RESPONSIBILITY", evidenceLinks: [], skills: ["Leadership"] }), [], AT);
    expect(noEvidence.approved).toBe(false);
    const r1 = await approveAchievement(id, noEvidence.id, AT);
    expect(r1).toMatchObject({ hasEvidence: false, xp: null });
    const withEvidence = await createAchievement(id, achievement(), [], AT);
    const r2 = await approveAchievement(id, withEvidence.id, AT);
    expect(r2.xp).toMatchObject({ awarded: true, points: 20 });
    expect((await approveAchievement(id, withEvidence.id, AT)).xp?.awarded).toBe(false);
    await expect(createAchievement(id, achievement(), [{ fileName: "page.html", mime: "text/html", data: Buffer.from("<script>") }], AT)).rejects.toThrow(/PDF or an image/);
    await expect(createAchievement(id, achievement({ evidenceLinks: ["javascript:alert(1)"] }), [], AT)).rejects.toThrow(/valid/);

    const overview = await skillsOverview(id);
    expect(overview.demonstrated.map((d) => d.skill)).toEqual(expect.arrayContaining(["Python", "Basic electronics", "Leadership"]));

    const edited = await updateAchievement(id, withEvidence.id, achievement({ outcomes: "Logged 10 days of readings." }), [], []);
    expect(edited.approved).toBe(false);
    const cv = await createCv(id, { title: "General", targetOpportunityId: null });
    expect(readSections(cv.sections).achievementIds).toEqual([noEvidence.id]);
  });

  it("tailors truthfully: relevant first, unclaimed requirements noted, invented figures rejected", async () => {
    const { id } = await createTestUser("Asha Patil");
    const club = await createAchievement(id, achievement({ title: "Debate club secretary", kind: "RESPONSIBILITY", description: "Organised weekly debates for 30 members.", outcomes: null, skills: ["Public speaking"], evidenceLinks: ["https://example.org/club"] }), [], AT);
    const logger = await createAchievement(id, achievement(), [], AT);
    for (const a of [club, logger]) await approveAchievement(id, a.id, AT);
    const { opportunity } = await addManualOpportunity(id, { sourceUrl: "https://example.org/z", postingText: POSTING, title: null, organisation: null, kind: null, location: null, workMode: null, deadline: null, compensation: null }, AT);
    const cv = await createCv(id, { title: "Embedded", targetOpportunityId: null });

    registerMockResponder("cv_tailor", (req) => ({
      suggestions: [
        { achievementId: logger.id, bullet: "Built a Python temperature logger with a sensor circuit, logging readings every minute", reason: "Python and electronics" },
        { achievementId: club.id, bullet: "Organised weekly debates for 300 members", reason: "Leadership" },
        { achievementId: "someone-elses-id", bullet: "Anything", reason: "x" },
      ],
      notes: [`refs:${req.references?.length}`],
    }));
    const tailored = await tailorCv(id, cv.id, opportunity.id);
    const s = readSections(tailored.sections);
    expect(s.achievementIds[0]).toBe(logger.id);
    expect(s.pending.map((p) => p.achievementId)).toEqual([logger.id]);
    expect(tailored.tailoringNotes.join(" ")).toMatch(/Not claimed — no evidence yet: “Git and collaborative coding”/);
    expect(tailored.tailoringNotes.join(" ")).toMatch(/figures that aren’t in your record \(300\)/);

    await resolveSuggestion(id, cv.id, logger.id, true);
    const doc = (await cvDocument(id, cv.id))!;
    expect(doc.name).toBe("Asha Patil");
    expect(doc.projects[0]).toMatchObject({ tailored: true, lines: ["Built a Python temperature logger with a sensor circuit, logging readings every minute"] });
    expect(doc.experience[0].title).toBe("Debate club secretary");
    const text = cvToText(doc, "md");
    expect(text).toMatch(/^# Asha Patil/);
    expect(text).toMatch(/## Projects\n\n\*\*Room temperature logger\*\*/);
    expect(text).toMatch(/Evidence: https:\/\/example.org\/logger/);

    const other = await createTestUser("Other");
    expect(await getCv(other.id, cv.id)).toBeNull();
    expect(await cvDocument(other.id, cv.id)).toBeNull();
    await expect(tailorCv(other.id, cv.id, opportunity.id)).rejects.toThrow(/not found/);
  });
});
