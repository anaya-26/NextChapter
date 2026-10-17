import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/server/jobs/register-all";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetAiProvider } from "@/server/ai";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { setGoogleTestDoubles } from "@/server/integrations/google-calendar";
import { zonedToUtc } from "@/lib/time";
import { weeklyRule } from "@/lib/recurrence";
import { createSubject } from "@/server/services/subjects";
import { confirmSyllabus, createSyllabus } from "@/server/services/syllabus";
import { createCommitment } from "@/server/services/commitments";
import { updatePrivacy, updateProfile } from "@/server/services/profile";
import { countdowns, createEvent, deleteEvent, exportIcs, findConflicts, listAgenda, updateEvent, type EventInput } from "@/server/services/calendar";
import { draftFromText } from "@/server/services/schedule-text";
import { applyPlan, buildPlan, clearFuturePlan, proposePlan, studentPace } from "@/server/services/planner";
import { detectMissedPattern, finishSession, logStudy, missSession, resolveObstacle, startSession } from "@/server/services/sessions";
import { applyRestart, getBacklog, suggestsRestart } from "@/server/services/restart";
import { deferForQuietHours, dispatchRemindersForUser } from "@/server/services/reminders";
import { scheduleRevision } from "@/server/services/revision";
import {
  applyChanges,
  completeConnection,
  createConnectState,
  disconnect,
  listChanges,
  pullRemote,
  queuePushChanges,
  refreshBusy,
  rejectChange,
  resolveConflict,
  verifyConnectState,
} from "@/server/services/calendar-sync";
import { createTestUser } from "../helpers/db";
import { createFakeGoogle } from "../helpers/fake-google";

const TZ = "Asia/Kolkata";
// Monday 19 Oct 2026, 8:00 am IST
const MON = zonedToUtc("2026-10-19", "08:00", TZ);

function useProvider(provider: "none" | "mock") {
  process.env.AI_PROVIDER = provider;
  resetEnvCache();
  resetAiProvider();
}

const event = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Event",
  kind: "PERSONAL",
  dateKey: "2026-10-19",
  startTime: "18:00",
  durationMinutes: 60,
  allDay: false,
  rrule: null,
  reminderMinutes: [],
  showCountdown: false,
  isDeadline: false,
  ...over,
});

async function studentWithRoadmap() {
  const { id } = await createTestUser();
  const subject = await createSubject(id, { name: "Physics", examDate: zonedToUtc("2026-11-20", "10:00", TZ) });
  const { syllabus } = await createSyllabus(id, {
    subjectId: subject.id,
    title: "",
    files: [],
    pastedText: "Unit I: Current Electricity\nChapter 3: Current Electricity — Ohm's law; Kirchhoff's laws; Wheatstone bridge; potentiometer.",
  });
  await runJobsUntilIdle({ types: ["syllabus.extract"] });
  await confirmSyllabus(id, syllabus.id, MON);
  await runJobsUntilIdle({ types: ["roadmap.enrich"] });
  return { userId: id, subject };
}

beforeAll(() => useProvider("none"));
afterEach(() => setGoogleTestDoubles({ oauth: null, api: null }));

describe("calendar events, commitments and conflicts", () => {
  it("expands weekly classes in the student's time zone, merges commitments and detects clashes", async () => {
    const { id } = await createTestUser();
    await createEvent(id, event({ title: "Physics coaching", kind: "CLASS", startTime: "17:00", durationMinutes: 120, rrule: weeklyRule([1, 3]) }));
    await createCommitment(id, { title: "College", kind: "CLASS", daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "14:00", location: null, flexible: false });
    const week = await listAgenda(id, zonedToUtc("2026-10-19", "00:00", TZ), zonedToUtc("2026-10-26", "00:00", TZ));
    const coaching = week.filter((i) => i.title === "Physics coaching");
    expect(coaching.map((c) => c.start.toISOString())).toEqual(["2026-10-19T11:30:00.000Z", "2026-10-21T11:30:00.000Z"]);
    expect(week.filter((i) => i.kind === "COMMITMENT")).toHaveLength(5);

    const clashes = await findConflicts(id, zonedToUtc("2026-10-21", "18:00", TZ), zonedToUtc("2026-10-21", "18:30", TZ));
    expect(clashes.map((c) => c.title)).toEqual(["Physics coaching"]);
    expect(await findConflicts(id, zonedToUtc("2026-10-22", "18:00", TZ), zonedToUtc("2026-10-22", "19:00", TZ))).toEqual([]);
  });

  it("counts down to exams and exports an .ics file", async () => {
    const { id } = await createTestUser();
    await createSubject(id, { name: "Chemistry", examDate: zonedToUtc("2026-10-29", "10:00", TZ) });
    await createEvent(id, event({ title: "Maths assignment", kind: "ASSIGNMENT", dateKey: "2026-10-23", startTime: "23:59", durationMinutes: 15, isDeadline: true, showCountdown: true }));
    await createEvent(id, event({ title: "Coaching", kind: "CLASS", startTime: "17:00", rrule: weeklyRule([1]) }));
    const c = await countdowns(id, MON);
    expect(c.map((x) => [x.title, x.daysLeft])).toEqual([
      ["Maths assignment", 4],
      ["Chemistry exam", 10],
    ]);
    const ics = await exportIcs(id, MON);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Maths assignment");
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20261019T170000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
  });

  it("reads a typed sentence into a draft with rules, or with (simulated) AI when configured", async () => {
    const { id } = await createTestUser();
    await createEvent(id, event({ title: "Coaching", kind: "CLASS", dateKey: "2026-10-20", startTime: "18:30", durationMinutes: 90 }));
    const rules = await draftFromText(id, "Physics revision tomorrow 7pm for 45 min", MON);
    expect(rules?.method).toBe("RULES");
    expect(rules?.draft).toMatchObject({ kind: "REVISION", dateKey: "2026-10-20", startTime: "19:00", durationMinutes: 45 });
    expect(rules?.conflicts.map((c) => c.title)).toEqual(["Coaching"]);
    useProvider("mock");
    try {
      const ai = await draftFromText(id, "Chemistry test on 23/10 at 10am", MON);
      expect(ai?.method).toBe("MOCK");
      expect(ai?.draft).toMatchObject({ kind: "EXAM", dateKey: "2026-10-23", startTime: "10:00" });
      expect(ai?.draft.assumptions[0]).toMatch(/Simulated AI/);
    } finally {
      useProvider("none");
    }
  });
});

describe("planner", () => {
  it("fits roadmap topics and deadlines into free time, around classes, within the daily limit", async () => {
    const { userId } = await studentWithRoadmap();
    await updateProfile(userId, { weeklyStudyHoursTarget: 7, preferredStudyTimes: ["EVENING"] }); // 60 min a day
    await createCommitment(userId, { title: "College", kind: "CLASS", daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "16:00", location: null, flexible: false });
    await createEvent(userId, event({ title: "Lab record", kind: "ASSIGNMENT", dateKey: "2026-10-21", startTime: "23:59", durationMinutes: 15, isDeadline: true, estimatedMinutes: 40 }));
    await createEvent(userId, event({ title: "Project report", kind: "PROJECT", dateKey: "2026-10-23", startTime: "23:59", durationMinutes: 15, isDeadline: true, estimatedMinutes: 300 }));

    const plan = await proposePlan(userId, MON);
    expect(plan.cap).toBe(60);
    for (const d of plan.result.days) expect(d.plannedMinutes).toBeLessThanOrEqual(60);
    // Deadline work is placed before the deadline, and nothing overlaps college hours.
    const lab = plan.result.blocks.filter((b) => b.title === "Work on: Lab record");
    expect(lab.reduce((s, b) => s + b.minutes, 0)).toBe(40);
    expect(Math.max(...lab.map((b) => b.end))).toBeLessThanOrEqual(zonedToUtc("2026-10-21", "23:59", TZ).getTime());
    for (const b of plan.result.blocks) {
      const local = new Date(b.start).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false });
      const weekday = new Date(b.start).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short" });
      if (!["Sat", "Sun"].includes(weekday)) expect(local < "08:50" || local >= "16:10").toBe(true);
    }
    // More work than time → concrete choices, each shown with its effect.
    expect(plan.overflowMinutes).toBeGreaterThan(0);
    const more = plan.choices.find((c) => c.id === "MORE_TIME");
    expect(more && more.overflowMinutes).toBeLessThan(plan.overflowMinutes);

    const applied = await applyPlan(userId, MON);
    expect(applied.created).toBe(plan.result.blocks.length);
    const sessions = await prisma.studySession.findMany({ where: { userId, status: "PLANNED" }, include: { calendarEvent: true } });
    expect(sessions).toHaveLength(applied.created);
    expect(sessions.every((s) => s.calendarEvent?.source === "PLANNER" && s.calendarEvent.kind === "STUDY")).toBe(true);
    // Planning again doesn't double-book: the days are already at their limit.
    const again = await buildPlan(userId, MON);
    expect(again.result.blocks).toHaveLength(0);
    expect(await clearFuturePlan(userId, MON)).toBe(applied.created);
  });

  it("learns the student's pace from finished sessions and logs unplanned study", async () => {
    const { userId } = await studentWithRoadmap();
    await applyPlan(userId, MON, { days: 3 });
    const planned = await prisma.studySession.findMany({ where: { userId, status: "PLANNED" }, orderBy: { plannedStart: "asc" }, take: 3 });
    let xp = 0;
    for (const s of planned) {
      await startSession(userId, s.id, s.plannedStart!);
      const r = await finishSession(userId, s.id, { actualMinutes: Math.round((s.plannedMinutes ?? 45) * 1.5) }, new Date(s.plannedStart!.getTime() + 3600_000));
      xp += r.xp.points;
    }
    expect(xp).toBeGreaterThan(0);
    expect((await studentPace(userId)).factor).toBeCloseTo(1.5, 1);
    const logged = await logStudy(userId, { title: "Past papers", minutes: 40, dateKey: "2026-10-19", time: "07:00" }, MON);
    expect(logged.status).toBe("COMPLETED");
    await expect(logStudy(userId, { title: "Future", minutes: 40, dateKey: "2026-10-20", time: "07:00" }, MON)).rejects.toThrow(/future/);
  });

  it("notices a time of day that keeps failing, asks why, and adjusts the plan", async () => {
    const { userId } = await studentWithRoadmap();
    await updateProfile(userId, { preferredStudyTimes: ["EARLY_MORNING"] });
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14"]) {
      const s = await prisma.studySession.create({ data: { userId, status: "PLANNED", title: "Morning study", plannedStart: zonedToUtc(day, "06:00", TZ), plannedMinutes: 45 } });
      await missSession(userId, s.id, "Too tired", zonedToUtc(day, "09:00", TZ));
    }
    const pattern = await detectMissedPattern(userId, MON);
    expect(pattern).toMatchObject({ part: "EARLY_MORNING", missed: 3, completed: 0 });
    const action = await prisma.suggestedAction.findFirstOrThrow({ where: { userId, actionType: "OBSTACLE_DISCUSSION" } });
    expect(await prisma.suggestedAction.count({ where: { userId, actionType: "OBSTACLE_DISCUSSION" } })).toBe(1);
    const inferred = await prisma.memoryItem.findFirstOrThrow({ where: { userId, kind: "PATTERN" } });
    expect(inferred.certainty).toBe("TENTATIVE");

    const r = await resolveObstacle(userId, action.id, { reason: "Too tired at that time", adjustment: "MOVE", moveTo: "EVENING" }, MON);
    expect(r.changed).toBeGreaterThan(0);
    const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile.preferredStudyTimes).toEqual(["EVENING"]);
    const stated = await prisma.memoryItem.findFirstOrThrow({ where: { userId, kind: "OBSTACLE" } });
    expect(stated.content).toMatch(/Too tired/);
    expect((await prisma.suggestedAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("ACCEPTED");
  });

  it("doesn't infer patterns when the student has turned inference off", async () => {
    const { userId } = await studentWithRoadmap();
    await updatePrivacy(userId, { aiInferPatterns: false });
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14"]) {
      const s = await prisma.studySession.create({ data: { userId, status: "PLANNED", plannedStart: zonedToUtc(day, "06:00", TZ), plannedMinutes: 45 } });
      await missSession(userId, s.id, null, zonedToUtc(day, "09:00", TZ));
    }
    expect(await detectMissedPattern(userId, MON)).not.toBeNull();
    expect(await prisma.memoryItem.count({ where: { userId, source: "INFERRED" } })).toBe(0);
  });
});

describe("restart flow", () => {
  it("offers a fresh start after slipping and rebuilds a lighter plan", async () => {
    const { userId } = await studentWithRoadmap();
    const topics = await prisma.topic.findMany({ where: { userId }, orderBy: { order: "asc" } });
    for (const t of topics.slice(0, 3)) await scheduleRevision(userId, { topicId: t.id, dateKey: "2026-10-14", time: "18:00" }, zonedToUtc("2026-10-13", "10:00", TZ));
    for (const day of ["2026-10-14", "2026-10-15", "2026-10-16"]) {
      await prisma.studySession.create({ data: { userId, status: "PLANNED", plannedStart: zonedToUtc(day, "18:00", TZ), plannedMinutes: 45 } });
    }
    const backlog = await getBacklog(userId, MON);
    expect(backlog.missedSessions).toBe(3);
    expect(backlog.overdueRevisions).toHaveLength(3);
    expect(suggestsRestart(backlog)).toBe(true);

    const r = await applyRestart(userId, "FRESH_START", MON);
    expect(r.revisions).toBe(3);
    const rescheduled = await prisma.revisionTask.findMany({ where: { userId, status: "SCHEDULED" }, orderBy: { dueAt: "asc" } });
    expect(rescheduled.map((x) => x.dueAt.toLocaleDateString("en-CA", { timeZone: TZ }))).toEqual(["2026-10-20", "2026-10-20", "2026-10-21"]);
    // Gentle start: the first days use 60% of the usual 120-minute limit.
    const firstDay = await prisma.studySession.findMany({ where: { userId, status: "PLANNED", plannedStart: { gte: MON, lt: zonedToUtc("2026-10-20", "00:00", TZ) } } });
    expect(firstDay.reduce((s, x) => s + (x.plannedMinutes ?? 0), 0)).toBeLessThanOrEqual(72);
    expect(await prisma.notification.count({ where: { userId, kind: "RESTART" } })).toBe(1);
    expect(suggestsRestart(await getBacklog(userId, MON))).toBe(false);
  });
});

describe("reminders", () => {
  it("creates each reminder once, honours frequency settings and quiet hours", async () => {
    const { id } = await createTestUser();
    await createEvent(id, event({ title: "Physics coaching", kind: "CLASS", startTime: "08:10", durationMinutes: 60, reminderMinutes: [10] }));
    await createEvent(id, event({ title: "Chemistry test", kind: "EXAM", dateKey: "2026-10-20", startTime: "08:00", durationMinutes: 120, reminderMinutes: [1440] }));
    expect(await dispatchRemindersForUser(id, MON)).toBe(3);
    expect(await dispatchRemindersForUser(id, new Date(MON.getTime() + 30_000))).toBe(0);
    const titles = (await prisma.notification.findMany({ where: { userId: id }, orderBy: { title: "asc" } })).map((n) => n.title);
    // Two event reminders, plus the 1-day countdown (delivered after 8 am).
    expect(titles).toEqual(["Chemistry test in 1 day", "Class: Physics coaching", "Exam: Chemistry test"]);

    await prisma.notification.deleteMany({ where: { userId: id } });
    await updateProfile(id, { reminderFrequency: "MINIMAL" });
    expect(await dispatchRemindersForUser(id, MON)).toBe(2);
    await updateProfile(id, { reminderFrequency: "OFF" });
    await prisma.notification.deleteMany({ where: { userId: id } });
    expect(await dispatchRemindersForUser(id, MON)).toBe(0);

    // 11 pm reminder for a 9 am event moves to 6:30 am; one for a 6 am event stays.
    const late = zonedToUtc("2026-10-19", "23:00", TZ);
    expect(deferForQuietHours(late, zonedToUtc("2026-10-20", "09:00", TZ), TZ).toISOString()).toBe(zonedToUtc("2026-10-20", "06:30", TZ).toISOString());
    expect(deferForQuietHours(late, zonedToUtc("2026-10-20", "06:00", TZ), TZ)).toEqual(late);
  });
});

describe("Google Calendar sync (fake Google)", () => {
  it("verifies the OAuth state against the user, browser nonce and expiry", () => {
    const { state, nonce } = createConnectState("user-a");
    expect(verifyConnectState(state, "user-a", nonce)).toBe(true);
    expect(verifyConnectState(state, "user-b", nonce)).toBe(false);
    expect(verifyConnectState(state, "user-a", "other")).toBe(false);
    expect(verifyConnectState(state.replace(/\.[^.]+$/, ".forged"), "user-a", nonce)).toBe(false);
  });

  it("previews every change, applies only approved ones, and surfaces conflicts", async () => {
    const google = createFakeGoogle();
    setGoogleTestDoubles({ oauth: google.oauth, api: () => google.api });
    const { id } = await createTestUser();
    const exam = await createEvent(id, event({ title: "Chemistry test", kind: "EXAM", dateKey: "2026-10-23", startTime: "10:00", durationMinutes: 120 }));
    const personal = await createEvent(id, event({ title: "Cousin's wedding", kind: "PERSONAL" }));
    const revision = await createEvent(id, event({ title: "Revise Ohm's law", kind: "REVISION", dateKey: "2026-10-20", startTime: "19:00", durationMinutes: 30 }));
    google.busy.push({ start: zonedToUtc("2026-10-20", "17:00", TZ).toISOString(), end: zonedToUtc("2026-10-20", "18:00", TZ).toISOString() });

    const conn = await completeConnection(id, "code-1", MON);
    expect(conn.studyCalendarId).toBeTruthy();
    expect(google.calendars.get(conn.studyCalendarId!)?.summary).toBe("NextChapter — study plan");
    // Only chosen kinds are proposed; nothing is in Google yet.
    const changes = await listChanges(id);
    expect(changes.map((c) => c.summary).sort()).toEqual([expect.stringMatching(/^Add “Chemistry test”/), expect.stringMatching(/^Add “Revise Ohm's law”/)]);
    expect(google.calendars.get(conn.studyCalendarId!)!.events.size).toBe(0);
    expect(await prisma.busyBlock.count({ where: { userId: id } })).toBe(1);
    expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: personal.id } })).syncState).toBe("LOCAL_ONLY");

    // Decline one, approve the rest.
    const revisionChange = changes.find((c) => c.eventId === revision.id)!;
    await rejectChange(id, revisionChange.id, MON);
    expect((await applyChanges(id, "all", MON)).applied).toBe(1);
    const syncedExam = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: exam.id } });
    expect(syncedExam).toMatchObject({ syncState: "SYNCED" });
    expect(google.calendars.get(conn.studyCalendarId!)!.events.get(syncedExam.externalId!)?.summary).toBe("Chemistry test");
    expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: revision.id } })).syncOptOut).toBe(true);
    expect(await queuePushChanges(id, MON)).toBe(0);

    // Edited in both places → conflict, resolved by keeping Google's version.
    google.editInGoogle(conn.studyCalendarId!, syncedExam.externalId!, { start: { dateTime: zonedToUtc("2026-10-23", "11:00", TZ).toISOString() }, end: { dateTime: zonedToUtc("2026-10-23", "13:00", TZ).toISOString() } });
    await updateEvent(id, exam.id, event({ title: "Chemistry unit test", kind: "EXAM", dateKey: "2026-10-23", startTime: "10:00", durationMinutes: 120 }));
    const result = await applyChanges(id, "all", MON);
    expect(result.conflicts).toBe(1);
    const conflict = (await listChanges(id)).find((c) => c.status === "CONFLICT")!;
    expect(conflict.conflictDetail).toMatchObject({ app: { title: "Chemistry unit test" }, google: { title: "Chemistry test" } });
    await resolveConflict(id, conflict.id, "google", MON);
    const resolved = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: exam.id } });
    expect(resolved.title).toBe("Chemistry test");
    expect(resolved.startAt.toISOString()).toBe(zonedToUtc("2026-10-23", "11:00", TZ).toISOString());

    // Changes made only in Google are proposed, not applied silently.
    google.createInGoogle(conn.studyCalendarId!, { summary: "Group study", start: { dateTime: zonedToUtc("2026-10-22", "16:00", TZ).toISOString() }, end: { dateTime: zonedToUtc("2026-10-22", "17:00", TZ).toISOString() } });
    expect(await pullRemote(id, MON)).toBe(1);
    expect(await prisma.calendarEvent.count({ where: { userId: id, title: "Group study" } })).toBe(0);
    await applyChanges(id, "all", MON);
    expect(await prisma.calendarEvent.count({ where: { userId: id, title: "Group study", source: "GOOGLE" } })).toBe(1);

    // Deleting locally proposes a delete in Google.
    await deleteEvent(id, exam.id);
    expect((await listChanges(id)).map((c) => c.op)).toEqual(["DELETE"]);
    await applyChanges(id, "all", MON);
    expect(google.calendars.get(conn.studyCalendarId!)!.events.get(resolved.externalId!)?.status).toBe("cancelled");

    // Busy times keep the planner away.
    expect(await refreshBusy(id, MON)).toBe(1);

    // Disconnect revokes access, optionally removes the NextChapter calendar, and forgets sync state.
    await disconnect(id, { deleteGoogleCalendar: true });
    expect(google.revoked).toEqual(["refresh-code-1"]);
    expect(google.calendars.has(conn.studyCalendarId!)).toBe(false);
    expect(await prisma.calendarConnection.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.busyBlock.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.calendarEvent.count({ where: { userId: id, externalId: { not: null } } })).toBe(0);
  });

  it("refuses a connection without permission to manage its own calendar", async () => {
    const google = createFakeGoogle({ scopes: ["https://www.googleapis.com/auth/calendar.freebusy"] });
    setGoogleTestDoubles({ oauth: google.oauth, api: () => google.api });
    const { id } = await createTestUser();
    await expect(completeConnection(id, "code-2", MON)).rejects.toThrow(/permission/);
    expect(google.revoked).toEqual(["access-code-2"]);
    expect(await prisma.calendarConnection.count({ where: { userId: id } })).toBe(0);
  });
});

describe("isolation", () => {
  it("never lets one student change another's calendar or sessions", async () => {
    const a = await studentWithRoadmap();
    const b = await createTestUser("Other");
    const ev = await createEvent(a.userId, event({ title: "Private" }));
    await applyPlan(a.userId, MON, { days: 2 });
    const session = await prisma.studySession.findFirstOrThrow({ where: { userId: a.userId } });
    await expect(updateEvent(b.id, ev.id, event({ title: "Hacked" }))).rejects.toThrow(/not found/);
    expect(await deleteEvent(b.id, ev.id)).toBe(false);
    await expect(startSession(b.id, session.id, MON)).rejects.toThrow(/not found/);
    await expect(finishSession(b.id, session.id, { actualMinutes: 30 }, MON)).rejects.toThrow(/not found/);
    await expect(createEvent(b.id, event({ topicId: session.topicId }))).rejects.toThrow(/Topic not found/);
    expect((await listAgenda(b.id, MON, new Date(MON.getTime() + 7 * 86400000))).filter((i) => i.kind !== "COMMITMENT")).toEqual([]);
    expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).title).toBe("Private");
  });
});
