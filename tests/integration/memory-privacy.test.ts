import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addMemory, correctMemory, deleteMemory, memoriesForAi } from "@/server/services/memory";
import { applyAgeBand, getPrivacy, recordGuardianConsent, updatePrivacy, updateProfile } from "@/server/services/profile";
import { buildStudentContext } from "@/server/ai/context";
import { dateOnly } from "@/lib/time";
import { createTestUser } from "../helpers/db";

async function journalEntry(userId: string, aiAccess: boolean, text = "I enjoy debugging code more than writing essays.") {
  return prisma.journalEntry.create({ data: { userId, date: dateOnly("2026-10-15"), kind: "REFLECTION", text, aiAccess } });
}

describe("AI memory controls", () => {
  it("uses corrected memories and forgets deleted ones in future personalisation", async () => {
    const { id } = await createTestUser();
    const m = await addMemory(id, { content: "Studies best in the morning", kind: "PREFERENCE", source: "CONVERSATION" });
    expect(m?.certainty).toBe("TENTATIVE");

    let ctx = await buildStudentContext(id, ["memory"]);
    expect(ctx.text).toContain("[TENTATIVE] Studies best in the morning");

    await correctMemory(id, m!.id, "Studies best late in the evening");
    ctx = await buildStudentContext(id, ["memory"]);
    expect(ctx.text).toContain("[CONFIRMED] Studies best late in the evening");
    expect(ctx.text).not.toContain("morning");
    const corrected = await prisma.memoryItem.findUniqueOrThrow({ where: { id: m!.id } });
    expect(corrected.correctedFrom).toBe("Studies best in the morning");

    await deleteMemory(id, m!.id);
    ctx = await buildStudentContext(id, ["memory"]);
    expect(ctx.text).not.toContain("evening");
    expect(ctx.used).not.toContain(expect.stringContaining("remembered"));
  });

  it("only uses journal-derived memories while journal access is permitted, and revoking deletes them", async () => {
    const { id } = await createTestUser();
    const entry = await journalEntry(id, true);
    await addMemory(id, { content: "Enjoys debugging", kind: "STRENGTH", source: "JOURNAL", journalEntryId: entry.id });

    // Journal access is off by default → the journal-derived memory is not used.
    expect((await getPrivacy(id)).aiUseJournal).toBe(false);
    expect((await memoriesForAi(id)).map((x) => x.content)).not.toContain("Enjoys debugging");

    await updatePrivacy(id, { aiUseJournal: true });
    expect((await memoriesForAi(id)).map((x) => x.content)).toContain("Enjoys debugging");

    // Un-sharing the entry hides the memory; revoking journal access deletes it outright.
    await prisma.journalEntry.update({ where: { id: entry.id }, data: { aiAccess: false } });
    expect((await memoriesForAi(id)).map((x) => x.content)).not.toContain("Enjoys debugging");
    await updatePrivacy(id, { aiUseJournal: false });
    expect(await prisma.memoryItem.count({ where: { userId: id, journalEntryId: entry.id } })).toBe(0);
  });

  it("deleting a journal entry deletes memories derived from it", async () => {
    const { id } = await createTestUser();
    const entry = await journalEntry(id, true);
    await addMemory(id, { content: "Finds essays hard", kind: "DIFFICULTY", source: "JOURNAL", journalEntryId: entry.id });
    await prisma.journalEntry.delete({ where: { id: entry.id } });
    expect(await prisma.memoryItem.count({ where: { userId: id } })).toBe(0);
  });
});

describe("permissions in the AI context", () => {
  it("includes only permitted categories and only individually shared journal entries", async () => {
    const { id } = await createTestUser();
    await updateProfile(id, { course: "B.Sc Physics", examTargets: ["GATE"] });
    await prisma.goal.create({ data: { userId: id, title: "Crack GATE 2028", horizon: "LONG", isCurrentPriority: true } });
    await journalEntry(id, true, "Shared: I want to try research.");
    await journalEntry(id, false, "Private: family worries.");

    let ctx = await buildStudentContext(id, ["profile", "goals", "journal"]);
    expect(ctx.text).toContain("B.Sc Physics");
    expect(ctx.text).toContain("Crack GATE 2028");
    expect(ctx.journal).toHaveLength(0); // journal permission off by default

    await updatePrivacy(id, { aiUseJournal: true, aiUseProfile: false, aiUseGoals: false });
    ctx = await buildStudentContext(id, ["profile", "goals", "journal"]);
    expect(ctx.text).not.toContain("B.Sc Physics");
    expect(ctx.text).not.toContain("Crack GATE");
    expect(ctx.journal.map((j) => j.text).join(" ")).toContain("try research");
    expect(ctx.journal.map((j) => j.text).join(" ")).not.toContain("family worries");
    expect(ctx.used).toEqual(["journal entries you shared (1)"]);
  });
});

describe("protections for students under 18", () => {
  it("turns off pattern inference and discoverability until guardian consent is recorded", async () => {
    const { id } = await createTestUser();
    await updatePrivacy(id, { aiInferPatterns: true, communityVisible: true });
    await applyAgeBand(id, "TEEN_13_15");
    let privacy = await getPrivacy(id);
    expect(privacy.aiInferPatterns).toBe(false);
    expect(privacy.communityVisible).toBe(false);
    expect((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: id } })).guardianConsent).toBe("PENDING");

    // Cannot be switched back on without consent…
    await updatePrivacy(id, { aiInferPatterns: true });
    expect((await getPrivacy(id)).aiInferPatterns).toBe(false);
    expect(await addMemory(id, { content: "Skips mornings", kind: "PATTERN", source: "INFERRED" })).toBeNull();

    // …but can after consent is recorded.
    await recordGuardianConsent(id, new Date());
    await updatePrivacy(id, { aiInferPatterns: true });
    privacy = await getPrivacy(id);
    expect(privacy.aiInferPatterns).toBe(true);
  });
});
