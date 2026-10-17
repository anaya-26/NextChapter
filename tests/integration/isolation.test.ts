import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { zonedToUtc } from "@/lib/time";
import { getOwnedFile, saveFile } from "@/server/storage";
import { createSubject, getSubject } from "@/server/services/subjects";
import { getOwnedTopic, getRoadmap } from "@/server/services/syllabus";
import { createNote, deleteNote, listNotes, updateNote } from "@/server/services/notes";
import { createFlashcard, deleteFlashcard } from "@/server/services/flashcards";
import { addMemory, deleteMemory, listMemories } from "@/server/services/memory";
import { createEntry, deleteEntry, getEntry, listEntries, updateEntry } from "@/server/services/journal";
import { createEvent, deleteEvent, getEvent, listAgenda } from "@/server/services/calendar";
import { getSession, startAdHocSession } from "@/server/services/sessions";
import { createGoal, deleteGoal, getGoal, listGoals } from "@/server/services/goals";
import { createConversation, deleteConversation, getConversation } from "@/server/services/companion";
import { addManualOpportunity, getOpportunity } from "@/server/services/opportunities";
import { getApplication, updateApplication } from "@/server/services/applications";
import { createAchievement, deleteAchievement, getAchievement } from "@/server/services/portfolio";
import { createCv, cvDocument, getCv, updateCv } from "@/server/services/cv";
import { createTestUser } from "../helpers/db";

const AT = zonedToUtc("2026-10-17", "18:00", "Asia/Kolkata");

/** A refused write either throws "not found" or reports that nothing changed. */
async function refused(p: Promise<unknown>) {
  try {
    expect(await p).toBeFalsy();
  } catch (e) {
    if ((e as Error).name === "AssertionError") throw e;
    expect((e as Error).message).toMatch(/not found|only|own/i);
  }
}

/**
 * One student's private data is never readable or changeable by another, across every
 * feature. Each service takes the signed-in student's id and scopes every query by it.
 */
describe("per-student isolation", () => {
  it("keeps every kind of private record invisible and untouchable to other students", async () => {
    const a = (await createTestUser("Owner")).id;
    const b = (await createTestUser("Intruder")).id;

    const subject = await createSubject(a, { name: "Chemistry" });
    const syllabus = await prisma.syllabus.create({ data: { userId: a, subjectId: subject.id, title: "Chemistry", status: "CONFIRMED" } });
    const topic = await prisma.topic.create({ data: { userId: a, syllabusId: syllabus.id, title: "Mole concept", order: 0 } });
    const note = await createNote(a, { topicId: topic.id, title: "Moles", content: "1 mol = 6.022 × 10^23 particles" }, AT);
    const card = await createFlashcard(a, { front: "Avogadro's number?", back: "6.022 × 10^23", topicId: topic.id }, AT);
    const memory = await addMemory(a, { content: "Prefers evening study", kind: "PREFERENCE", source: "STUDENT" });
    const { entry } = await createEntry(a, { kind: "REFLECTION", dateKey: "2026-10-17", text: "A private reflection about my exam stress.", aiAccess: false }, AT);
    const event = await createEvent(a, { title: "Chemistry test", kind: "EXAM", dateKey: "2026-10-30", startTime: null, durationMinutes: 60, allDay: true, rrule: null, reminderMinutes: [], showCountdown: true, isDeadline: false });
    const session = await startAdHocSession(a, { title: "Focus", plannedMinutes: 25 }, AT);
    const goal = await createGoal(a, { title: "Score 90 in Chemistry", description: null, whyItMatters: null, horizon: "SHORT", category: "EXAM", targetDate: null, isCurrentPriority: true });
    const convo = await createConversation(a, {});
    const { opportunity, application } = await addManualOpportunity(a, { sourceUrl: "https://example.org/opening", postingText: null, title: "Private opening", organisation: "Org", kind: "INTERNSHIP", location: null, workMode: null, deadline: null, compensation: null }, AT);
    const achievement = await createAchievement(a, { kind: "PROJECT", title: "Titration app", organisation: null, role: null, startMonth: null, endMonth: null, description: "An app that logs titration readings.", outcomes: null, skills: [], subjects: [], evidenceLinks: [] }, [], AT);
    const cv = await createCv(a, { title: "General", targetOpportunityId: null });
    const file = await saveFile({ userId: a, purpose: "EVIDENCE", fileName: "cert.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.4") });

    // Reads return nothing.
    expect(await getSubject(b, subject.id)).toBeNull();
    expect(await getRoadmap(b, subject.id)).toBeNull();
    expect(await getOwnedTopic(b, topic.id)).toBeNull();
    expect(await listNotes(b, topic.id)).toEqual([]);
    expect(await listMemories(b)).toEqual([]);
    expect(await getEntry(b, entry.id)).toBeNull();
    expect(await listEntries(b)).toEqual([]);
    expect(await getEvent(b, event.id)).toBeNull();
    expect(await listAgenda(b, new Date("2026-10-01"), new Date("2026-11-30"))).toEqual([]);
    expect(await getSession(b, session.id)).toBeNull();
    expect(await getGoal(b, goal.id)).toBeNull();
    expect(await listGoals(b)).toEqual([]);
    expect(await getConversation(b, convo.id)).toBeNull();
    expect(await getOpportunity(b, opportunity.id)).toBeNull();
    expect(await getApplication(b, opportunity.id)).toBeNull();
    expect(await getAchievement(b, achievement.id)).toBeNull();
    expect(await getCv(b, cv.id)).toBeNull();
    expect(await cvDocument(b, cv.id)).toBeNull();
    expect(await getOwnedFile(b, file.id)).toBeNull();

    // Writes and deletes change nothing.
    await refused(updateNote(b, note.id, { title: "x", content: "x" }, AT));
    await refused(deleteNote(b, note.id));
    await refused(deleteFlashcard(b, card.id));
    await refused(deleteMemory(b, memory!.id));
    await refused(updateEntry(b, entry.id, { text: "changed" }));
    await refused(deleteEntry(b, entry.id));
    await refused(deleteEvent(b, event.id));
    await refused(deleteGoal(b, goal.id));
    await refused(deleteConversation(b, convo.id));
    await refused(updateApplication(b, application.id, { status: "APPLIED", notes: "x", nextStep: null, nextStepDate: null, cvId: null }, AT));
    await refused(deleteAchievement(b, achievement.id));
    await refused(updateCv(b, cv.id, { title: "x" }));
    await refused(createNote(b, { topicId: topic.id, title: "x", content: "x" }, AT));
    await refused(createFlashcard(b, { front: "x", back: "y", topicId: topic.id }, AT));

    // Everything is still there, unchanged, for the owner.
    expect((await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).content).toBe("1 mol = 6.022 × 10^23 particles");
    expect(await prisma.flashcard.count({ where: { id: card.id } })).toBe(1);
    expect(await prisma.memoryItem.count({ where: { id: memory!.id } })).toBe(1);
    expect((await getEntry(a, entry.id))?.text).toBe("A private reflection about my exam stress.");
    expect(await getEvent(a, event.id)).not.toBeNull();
    expect(await getGoal(a, goal.id)).not.toBeNull();
    expect(await getConversation(a, convo.id)).not.toBeNull();
    expect((await getApplication(a, opportunity.id))?.status).toBe("SAVED");
    expect(await getAchievement(a, achievement.id)).not.toBeNull();
    expect((await getCv(a, cv.id))?.title).toBe("General");
    expect(await getOwnedFile(a, file.id)).not.toBeNull();
  });
});
