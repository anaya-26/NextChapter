import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createGoal, deleteGoal, listGoals, setPriorityGoal, updateGoal } from "@/server/services/goals";
import { createCommitment, deleteCommitment, listCommitments } from "@/server/services/commitments";
import { addMemory, deleteMemory, listMemories } from "@/server/services/memory";
import { awardXp, xpSummary } from "@/server/services/xp";
import { zonedToUtc } from "@/lib/time";
import { createTestUser } from "../helpers/db";

const goalInput = (title: string, isCurrentPriority = false) => ({
  title,
  description: null,
  whyItMatters: null,
  horizon: "SHORT" as const,
  category: "ACADEMIC" as const,
  targetDate: "2026-12-01",
  isCurrentPriority,
});

describe("per-student data isolation", () => {
  it("prevents one student from reading or changing another student's goals, commitments and memories", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const goal = await createGoal(a.id, goalInput("A's goal"));
    const commitment = await createCommitment(a.id, {
      title: "Coaching",
      kind: "COACHING",
      daysOfWeek: [1, 3],
      startTime: "17:00",
      endTime: "19:00",
      location: null,
      flexible: false,
    });
    const memory = await addMemory(a.id, { content: "A likes diagrams", kind: "PREFERENCE", source: "STUDENT" });

    expect(await listGoals(b.id)).toHaveLength(0);
    expect(await listCommitments(b.id)).toHaveLength(0);
    expect(await listMemories(b.id)).toHaveLength(0);

    expect(await updateGoal(b.id, goal.id, goalInput("hijacked"))).toBeNull();
    expect(await deleteGoal(b.id, goal.id)).toBe(false);
    expect(await setPriorityGoal(b.id, goal.id)).toBe(false);
    expect(await deleteCommitment(b.id, commitment.id)).toBe(false);
    expect(await deleteMemory(b.id, memory!.id)).toBe(false);

    const still = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(still.title).toBe("A's goal");
    expect(await prisma.commitment.count({ where: { id: commitment.id } })).toBe(1);
    expect(await prisma.memoryItem.count({ where: { id: memory!.id } })).toBe(1);
  });
});

describe("goals", () => {
  it("keeps exactly one current priority", async () => {
    const { id } = await createTestUser();
    const g1 = await createGoal(id, goalInput("First", true));
    const g2 = await createGoal(id, goalInput("Second", true));
    let goals = await listGoals(id);
    expect(goals.filter((g) => g.isCurrentPriority).map((g) => g.id)).toEqual([g2.id]);
    await setPriorityGoal(id, g1.id);
    goals = await listGoals(id);
    expect(goals.filter((g) => g.isCurrentPriority).map((g) => g.id)).toEqual([g1.id]);
  });
});

describe("XP", () => {
  it("awards an action once, no matter how often it is repeated", async () => {
    const { id } = await createTestUser();
    const at = new Date("2026-10-17T10:00:00Z");
    const first = await awardXp(id, { action: "REVISION_COMPLETE", dedupeKey: "revision:task-1", reason: "Revised", at });
    const again = await awardXp(id, { action: "REVISION_COMPLETE", dedupeKey: "revision:task-1", reason: "Revised", at });
    const parallel = await Promise.all([1, 2, 3].map(() => awardXp(id, { action: "MILESTONE", dedupeKey: "milestone:m1", reason: "M", at })));
    expect(first.awarded).toBe(true);
    expect(again.awarded).toBe(false);
    expect(parallel.filter((r) => r.awarded)).toHaveLength(1);
    expect((await xpSummary(id)).total).toBe(10 + 20);
  });

  it("caps rapid repetition per day", async () => {
    const { id } = await createTestUser();
    const at = new Date("2026-10-17T10:00:00Z");
    for (let i = 0; i < 60; i++) {
      await awardXp(id, { action: "FLASHCARD_REVIEW", dedupeKey: `card:${i}`, reason: "Card", at });
    }
    expect((await xpSummary(id)).total).toBe(40);
    // A new day resets the cap.
    await awardXp(id, { action: "FLASHCARD_REVIEW", dedupeKey: "card:next-day", reason: "Card", at: new Date("2026-10-18T10:00:00Z") });
    expect((await xpSummary(id)).total).toBe(41);
  });

  it("celebrates returning after a break of three or more days, once", async () => {
    const { id } = await createTestUser();
    await awardXp(id, { action: "CHECK_IN", dedupeKey: "checkin:2026-10-01", reason: "Check-in", at: zonedToUtc("2026-10-01", "09:00") });
    const back = await awardXp(id, { action: "CHECK_IN", dedupeKey: "checkin:2026-10-06", reason: "Check-in", at: zonedToUtc("2026-10-06", "09:00") });
    expect(back.returnBonus).toBe(15);
    const later = await awardXp(id, { action: "REFLECTION", dedupeKey: "reflection:2026-10-06", reason: "Reflection", at: zonedToUtc("2026-10-06", "21:00") });
    expect(later.returnBonus).toBe(0);
    const badges = await prisma.userBadge.findMany({ where: { userId: id } });
    expect(badges.map((b) => b.badgeCode)).toContain("comeback");
    const note = await prisma.notification.findFirst({ where: { userId: id, dedupeKey: "return:2026-10-06" } });
    expect(note?.title).toBe("Welcome back!");
  });
});
