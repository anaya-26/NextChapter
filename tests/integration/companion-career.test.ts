import { beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { zonedToUtc } from "@/lib/time";
import { createSubject } from "@/server/services/subjects";
import { createGoal, upsertCareerInterest } from "@/server/services/goals";
import { updatePrivacy, updateProfile } from "@/server/services/profile";
import { createConversation, getConversation, parseReply, sendMessage, type ReplyEvent } from "@/server/services/companion";
import { acceptSuggestion } from "@/server/services/suggestions";
import { completeExploration, createDomainGoal, engagement, generateCareerReview, startExploration, type Possibility } from "@/server/services/career";
import { seedDemoHistory } from "@/server/services/demo";
import { createTestUser } from "../helpers/db";

const TZ = "Asia/Kolkata";
const AT = zonedToUtc("2026-10-21", "18:00", TZ);

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  resetEnvCache();
  resetAiProvider();
}

async function collect(gen: AsyncGenerator<ReplyEvent>) {
  const events: ReplyEvent[] = [];
  for await (const e of gen) events.push(e);
  const done = events.find((e) => e.type === "done") as Extract<ReplyEvent, { type: "done" }>;
  const streamed = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
  return { events, done, streamed };
}

async function xpDays(userId: string, keys: string[]) {
  for (const k of keys) await prisma.xpEvent.create({ data: { userId, action: "CHECK_IN", points: 5, dedupeKey: `t:${k}`, reason: "test", occurredOn: new Date(`${k}T00:00:00Z`), createdAt: new Date(`${k}T12:00:00Z`) } });
}

function daysBack(n: number, every = 1) {
  const out: string[] = [];
  for (let i = 0; i < n; i += every) out.push(new Date(AT.getTime() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

beforeAll(() => useProvider("mock"));

describe("companion", () => {
  it("parses actions out of a reply and ignores malformed blocks", () => {
    expect(parseReply('Hello there.\n<actions>[{"type":"PLAN_WEEK","label":"Plan"}]</actions>')).toEqual({ text: "Hello there.", actions: [{ type: "PLAN_WEEK", label: "Plan" }] });
    expect(parseReply("Hi <actions>not json</actions>")).toEqual({ text: "Hi", actions: [] });
    expect(parseReply('Hi <actions>[{"type":"DELETE_ACCOUNT","label":"x"}]</actions>').actions).toEqual([]);
  });

  it("streams a reply, says what it used, and turns suggestions into confirmable actions", async () => {
    const { id } = await createTestUser();
    await createGoal(id, { title: "Score 90 in Physics", description: null, whyItMatters: null, horizon: "SHORT", category: "EXAM", targetDate: null, isCurrentPriority: true });
    const c = await createConversation(id, { context: "PLANNING" });
    const { done, streamed } = await collect(sendMessage(id, c.id, "Help me plan my study this week", AT));
    expect(streamed.trim()).toBe(done.text);
    expect(done.text).toMatch(/Simulated AI/);
    expect(done.text).not.toMatch(/<actions>/);
    expect(done.generatedBy).toBe("MOCK");
    expect(done.used).toContain("your goals");
    expect(done.actions.map((a) => a.label)).toEqual(["Book 45 minutes tomorrow at 7 pm", "Plan my week"]);
    const saved = await getConversation(id, c.id);
    expect(saved?.messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    expect(saved?.messages[1].contextUsed).toContain("your goals");
    expect(saved?.title).toBe("Help me plan my study this week");

    const r = await acceptSuggestion(id, done.actions[0].id, AT);
    expect(r.href).toBe("/calendar?date=2026-10-22");
    const session = await prisma.studySession.findFirstOrThrow({ where: { userId: id }, include: { calendarEvent: true } });
    expect(session.calendarEvent?.startAt.toISOString()).toBe(zonedToUtc("2026-10-22", "19:00", TZ).toISOString());
    await expect(acceptSuggestion(id, done.actions[0].id, AT)).rejects.toThrow();
  });

  it("leaves out data categories the student switched off and remembers only with permission", async () => {
    const { id } = await createTestUser();
    await createGoal(id, { title: "Finish the syllabus", description: null, whyItMatters: null, horizon: "SHORT", category: "ACADEMIC", targetDate: null, isCurrentPriority: true });
    await updatePrivacy(id, { aiUseGoals: false });
    const c = await createConversation(id, {});
    const { done } = await collect(sendMessage(id, c.id, "I study better in the evening, what next?", AT));
    expect(done.used).not.toContain("your goals");
    await runJobsUntilIdle({ types: ["companion.remember"] });
    const memory = await prisma.memoryItem.findFirstOrThrow({ where: { userId: id, source: "CONVERSATION" } });
    expect(memory).toMatchObject({ certainty: "TENTATIVE", kind: "PREFERENCE" });

    await updatePrivacy(id, { aiMemoryEnabled: false });
    await collect(sendMessage(id, c.id, "I also like mornings", AT));
    await runJobsUntilIdle({ types: ["companion.remember"] });
    expect(await prisma.memoryItem.count({ where: { userId: id, source: "CONVERSATION" } })).toBe(1);
  });

  it("answers distress with support instead of coaching, and without calling the AI", async () => {
    const { id } = await createTestUser();
    const c = await createConversation(id, {});
    const before = await prisma.aiUsage.count({ where: { userId: id } });
    const { done } = await collect(sendMessage(id, c.id, "I feel hopeless and can't go on", AT));
    expect(done.text).toMatch(/14416/);
    expect(done.generatedBy).toBe("RULES");
    expect(done.actions).toEqual([]);
    expect(await prisma.aiUsage.count({ where: { userId: id } })).toBe(before);
  });

  it("stays useful without AI and keeps conversations private", async () => {
    useProvider("none");
    try {
      const { id } = await createTestUser();
      const c = await createConversation(id, {});
      const { done } = await collect(sendMessage(id, c.id, "What should I do?", AT));
      expect(done.text).toMatch(/isn’t set up/);
      expect(done.actions.map((a) => a.label)).toContain("Plan my week");
      const other = await createTestUser("Other");
      expect(await getConversation(other.id, c.id)).toBeNull();
      await expect(collect(sendMessage(other.id, c.id, "hello", AT))).rejects.toThrow(/not found/);
      await expect(acceptSuggestion(other.id, done.actions[0].id, AT)).rejects.toThrow();
    } finally {
      useProvider("mock");
    }
  });
});

describe("career discovery", () => {
  it("counts active days without resetting for missed days, and unlocks the full review after ~3 months", async () => {
    const { id } = await createTestUser();
    await xpDays(id, daysBack(20, 2)); // 10 active days over 18 days
    let e = await engagement(id, AT);
    expect(e).toMatchObject({ activeDays: 10, eligible: false, canPreview: true });
    await xpDays(id, daysBack(90, 3).filter((k) => !daysBack(20, 2).includes(k)));
    e = await engagement(id, AT);
    expect(e.spanDays).toBeGreaterThanOrEqual(84);
    expect(e.activeDays).toBeGreaterThanOrEqual(30);
    expect(e.eligible).toBe(true);
  });

  it("gives preliminary findings from evidence without AI, honest about limits and permissions", async () => {
    useProvider("none");
    try {
      const { id } = await createTestUser();
      await updateProfile(id, { educationStage: "UNDERGRADUATE", interests: ["coding games"] });
      const subject = await createSubject(id, { name: "Computer Science" });
      for (let i = 0; i < 6; i++) await prisma.studySession.create({ data: { userId: id, subjectId: subject.id, status: "COMPLETED", startedAt: new Date(AT.getTime() - i * 86400000), actualMinutes: 60 } });
      const glance = await createSubject(id, { name: "Biology" });
      await prisma.studySession.create({ data: { userId: id, subjectId: glance.id, status: "COMPLETED", startedAt: AT, actualMinutes: 10 } });
      await xpDays(id, daysBack(6));
      const review = await generateCareerReview(id, AT);
      expect(review).toMatchObject({ kind: "PRELIMINARY", generatedBy: "RULES" });
      const p = review.suggestions as unknown as Possibility[];
      expect(p[0].title).toBe("Software engineering");
      expect(p[0].evidence.join(" ")).toMatch(/Computer Science: 6 h studied/);
      expect(p[0].whyItFits).toMatch(/your time on Computer Science/);
      expect(p.flatMap((x) => x.evidence).join(" ")).not.toMatch(/Biology/);
      expect(p[0].uncertainties.join(" ")).toMatch(/haven’t tried hands-on work/);
      expect(p[0].nextStep).toMatch(/^Roles to look at/);
      expect(review.limitations[0]).toMatch(/^Preliminary/);

      await updatePrivacy(id, { aiUseProgress: false });
      const limited = await generateCareerReview(id, AT);
      expect(limited.limitations.join(" ")).toMatch(/Not used: study progress/);
    } finally {
      useProvider("mock");
    }
  });

  it("produces a labelled discovery review from demo history and turns a possibility into an exploration", async () => {
    const { id } = await createTestUser();
    await seedDemoHistory(id, AT);
    const e = await engagement(id, AT);
    expect(e.eligible).toBe(true);
    expect(e.demoDays).toBeGreaterThan(0);
    const review = await generateCareerReview(id, AT);
    expect(review.kind).toBe("DISCOVERY");
    expect(review.generatedBy).toBe("MOCK");
    expect(review.limitations.join(" ")).toMatch(/labelled demonstration data/);
    const possibilities = review.suggestions as unknown as Possibility[];
    expect(possibilities.length).toBeGreaterThanOrEqual(2);

    const project = await startExploration(id, { reviewId: review.id, index: 0 });
    expect(project.status).toBe("ACTIVE");
    expect((await startExploration(id, { reviewId: review.id, index: 0 })).id).toBe(project.id);
    const other = await createTestUser("Other");
    await expect(startExploration(other.id, { reviewId: review.id, index: 0 })).rejects.toThrow(/not found/);

    const xp = await completeExploration(id, project.id, { reflection: "Enjoyed building it more than I expected", interest: "MORE" }, AT);
    expect(xp.points).toBe(15);
    await expect(completeExploration(id, project.id, { reflection: "again", interest: "MORE" }, AT)).rejects.toThrow();
    expect(await prisma.careerInterest.count({ where: { userId: id, domain: project.domain! } })).toBe(1);
  });

  it("gives students with a clear direction a goal with milestones right away", async () => {
    const { id } = await createTestUser();
    await updateProfile(id, { careerClarity: "CLEAR" });
    await upsertCareerInterest(id, { domain: "Data science & AI", roles: [], companies: [], cities: [], workModes: [], status: "SELECTED", notes: null });
    const goal = await createDomainGoal(id, "Data science & AI");
    expect(goal).toMatchObject({ title: "Build towards Data science & AI", category: "CAREER", horizon: "LONG" });
    expect(await prisma.milestone.count({ where: { goalId: goal.id } })).toBe(5);
    expect((await createDomainGoal(id, "Data science & AI")).id).toBe(goal.id);
  });
});
