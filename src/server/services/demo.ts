import "server-only";
import { prisma } from "../db";
import { addDaysToKey, dateOnly, localDateKey, zonedToUtc } from "@/lib/time";
import { sessionPoints } from "@/lib/xp-rules";
import { getProfile } from "./profile";
import { awardXp } from "./xp";
import { createEvent } from "./calendar";

/** Small deterministic PRNG so demo history is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DEMO_SUBJECTS = [
  {
    name: "Physics (demo)",
    units: [
      { title: "Unit 1: Electrostatics", topics: ["Electric charge and Coulomb's law", "Electric field and field lines", "Gauss's law"] },
      { title: "Unit 2: Current electricity", topics: ["Ohm's law and resistance", "Kirchhoff's laws", "Wheatstone bridge"] },
    ],
  },
  {
    name: "Computer Science (demo)",
    units: [
      { title: "Unit 1: Python basics", topics: ["Variables and data types", "Conditionals and loops", "Functions"] },
      { title: "Unit 2: Data structures", topics: ["Lists and dictionaries", "Searching and sorting"] },
    ],
  },
];

const REFLECTIONS = [
  "Spent the evening debugging my loop exercise — finally understood off-by-one errors. Weirdly fun.",
  "Coulomb's law numericals are fine but long derivations still confuse me. Need to slow down.",
  "Explained functions to my cousin today. Teaching it made me understand it better.",
  "Missed the morning session again. Mornings before college are just too rushed.",
  "Built a tiny temperature logger with the Arduino kit at school. Want to do more projects like this.",
  "Kirchhoff's laws clicked after drawing the loops in colour.",
  "Felt tired after coaching; did only 20 minutes but it still counted.",
  "Sorting algorithms visualisation was the best part of the week.",
];

/**
 * Creates ~3 months of clearly labelled demonstration history ending at `at`.
 * Every record is flagged isDemo and removable with removeDemoData().
 */
export async function seedDemoHistory(userId: string, at: Date) {
  await removeDemoData(userId);
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const today = localDateKey(at, tz);
  const start = addDaysToKey(today, -95);
  const rand = rng(42);

  // Subjects, confirmed syllabi, topics and a few questions.
  const topics: { id: string; title: string; subjectId: string }[] = [];
  for (const subj of DEMO_SUBJECTS) {
    const subject = await prisma.subject.create({ data: { userId, name: subj.name, isDemo: true, color: "#8a4fbf" } });
    const syllabus = await prisma.syllabus.create({
      data: {
        userId,
        subjectId: subject.id,
        title: `${subj.name} syllabus`,
        status: "CONFIRMED",
        extractionMethod: "MANUAL",
        confirmedAt: zonedToUtc(start, "18:00", tz),
      },
    });
    let order = 0;
    for (const [ui, unit] of subj.units.entries()) {
      const u = await prisma.syllabusUnit.create({ data: { syllabusId: syllabus.id, title: unit.title, order: ui } });
      for (const title of unit.topics) {
        const t = await prisma.topic.create({
          data: {
            userId,
            syllabusId: syllabus.id,
            unitId: u.id,
            title,
            order: order++,
            estimatedMinutes: 90,
            objectives: [`Explain ${title.toLowerCase()} in your own words`, `Solve standard questions on ${title.toLowerCase()}`],
          },
        });
        topics.push({ id: t.id, title, subjectId: subject.id });
        for (let q = 0; q < 3; q++) {
          await prisma.question.create({
            data: {
              userId,
              topicId: t.id,
              type: "MCQ",
              prompt: `(Demo) Practice question ${q + 1} on ${title}`,
              options: [
                { id: "a", text: "Option A" },
                { id: "b", text: "Option B" },
                { id: "c", text: "Option C" },
              ],
              answer: { correct: ["a"] },
              generatedBy: "RULES",
            },
          });
        }
      }
    }
  }

  const questions = await prisma.question.findMany({ where: { userId, topic: { syllabus: { subject: { isDemo: true } } } } });
  const breakStart = 40; // a 6-day break mid-way, to show the "welcome back" celebration

  for (let d = 0; d < 95; d++) {
    if (d >= breakStart && d < breakStart + 6) continue;
    const dayKey = addDaysToKey(start, d);
    const active = rand() < 0.62;
    if (!active) continue;
    const progress = d / 95; // accuracy improves over time
    const topic = topics[Math.min(topics.length - 1, Math.floor(progress * topics.length + rand() * 2))];

    // Morning plan, frequently missed (an obstacle pattern to discuss).
    if (rand() < 0.45) {
      const plannedStart = zonedToUtc(dayKey, "06:30", tz);
      const missed = rand() < 0.7;
      await prisma.studySession.create({
        data: {
          userId,
          topicId: topic.id,
          subjectId: topic.subjectId,
          kind: "STUDY",
          status: missed ? "MISSED" : "COMPLETED",
          title: `Morning revision: ${topic.title}`,
          plannedStart,
          plannedMinutes: 45,
          actualMinutes: missed ? null : 40,
          startedAt: missed ? null : plannedStart,
          endedAt: missed ? null : new Date(plannedStart.getTime() + 40 * 60000),
          missedReason: missed ? "Rushed morning before college" : null,
          isDemo: true,
        },
      });
    }

    // Evening session — usually completed.
    const minutes = 25 + Math.floor(rand() * 40);
    const startedAt = zonedToUtc(dayKey, rand() < 0.5 ? "19:00" : "20:30", tz);
    const session = await prisma.studySession.create({
      data: {
        userId,
        topicId: topic.id,
        subjectId: topic.subjectId,
        kind: "FOCUS",
        status: "COMPLETED",
        title: `Evening focus: ${topic.title}`,
        plannedStart: startedAt,
        plannedMinutes: 45,
        actualMinutes: minutes,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60000),
        energy: 2 + Math.floor(rand() * 3),
        isDemo: true,
      },
    });
    await awardXp(userId, {
      action: "STUDY_SESSION",
      points: sessionPoints(minutes),
      dedupeKey: `session:${session.id}`,
      reason: `Focused for ${minutes} minutes (demo)`,
      at: session.endedAt!,
      isDemo: true,
    });

    // Practice attempts with improving accuracy.
    const topicQs = questions.filter((q) => q.topicId === topic.id);
    for (const q of topicQs) {
      if (rand() < 0.5) continue;
      const correct = rand() < 0.45 + progress * 0.45;
      const attemptAt = new Date(startedAt.getTime() + 30 * 60000);
      const attempt = await prisma.practiceAttempt.create({
        data: {
          userId,
          questionId: q.id,
          topicId: topic.id,
          response: { selected: [correct ? "a" : "b"] },
          isCorrect: correct,
          score: correct ? 1 : 0,
          feedbackBy: "RULES",
          isDemo: true,
          attemptedAt: attemptAt,
        },
      });
      await awardXp(userId, {
        action: "PRACTICE_ATTEMPT",
        dedupeKey: `attempt:${attempt.id}`,
        reason: "Answered a practice question (demo)",
        at: attemptAt,
        isDemo: true,
      });
    }

    // Reflections a few times a week, shared with the AI so the review can use them.
    if (rand() < 0.3) {
      const text = REFLECTIONS[Math.floor(rand() * REFLECTIONS.length)];
      const entry = await prisma.journalEntry.create({
        data: {
          userId,
          date: dateOnly(dayKey),
          kind: "REFLECTION",
          title: "Daily reflection (demo)",
          text,
          energy: 2 + Math.floor(rand() * 3),
          aiAccess: true,
          isDemo: true,
          createdAt: zonedToUtc(dayKey, "22:00", tz),
        },
      });
      await awardXp(userId, {
        action: "REFLECTION",
        dedupeKey: `reflection:${dayKey}`,
        reason: "Wrote a reflection (demo)",
        sourceType: "JournalEntry",
        sourceId: entry.id,
        at: zonedToUtc(dayKey, "22:00", tz),
        isDemo: true,
      });
    }
  }

  // Topic progress consistent with the history.
  for (const [i, t] of topics.entries()) {
    const frac = i / topics.length;
    if (frac < 0.75) {
      await prisma.topic.update({
        where: { id: t.id },
        data: {
          status: "STUDIED",
          studiedAt: zonedToUtc(addDaysToKey(start, Math.floor(frac * 90) + 3), "20:00", tz),
          understandingCheckedAt: frac < 0.55 ? zonedToUtc(addDaysToKey(start, Math.floor(frac * 90) + 6), "20:30", tz) : null,
          lastRevisedAt: frac < 0.4 ? zonedToUtc(addDaysToKey(start, Math.floor(frac * 90) + 14), "19:30", tz) : null,
          revisionCount: frac < 0.4 ? 1 : 0,
        },
      });
    }
  }

  // Approved portfolio achievements with evidence (example.org links are placeholders by design).
  const achievements = [
    {
      kind: "PROJECT" as const,
      title: "Room temperature logger with Arduino (demo)",
      description: "Built a sensor circuit and Python script that logs room temperature every minute and plots it.",
      outcomes: "Logged 7 days of readings; presented at the school science club.",
      skillsDemonstrated: ["Python", "Basic electronics", "Data plotting"],
      evidenceLinks: ["https://example.org/demo/temperature-logger"],
    },
    {
      kind: "COMPETITION" as const,
      title: "Inter-school science exhibition — runner-up (demo)",
      description: "Presented a working model of a Wheatstone bridge-based strain sensor.",
      outcomes: "Runner-up among 24 teams.",
      skillsDemonstrated: ["Presentation", "Applied physics"],
      evidenceLinks: [],
    },
    {
      kind: "VOLUNTEERING" as const,
      title: "Weekend Python help for juniors (demo)",
      description: "Helped four Class 9 students with Python basics on weekends for six weeks.",
      outcomes: "All four completed their school coding assignments.",
      skillsDemonstrated: ["Teaching", "Python", "Communication"],
      evidenceLinks: [],
    },
  ];
  for (const [i, a] of achievements.entries()) {
    const when = zonedToUtc(addDaysToKey(start, 20 + i * 25), "18:00", tz);
    const rec = await prisma.achievement.create({
      data: { userId, ...a, subjectsRelated: [], approved: true, approvedAt: when, isDemo: true, createdAt: when },
    });
    await awardXp(userId, { action: "ACHIEVEMENT_ADDED", dedupeKey: `achievement:${rec.id}`, reason: `Added achievement: ${a.title}`, at: when, isDemo: true });
  }

  // A completed personal experiment.
  await prisma.experiment.create({
    data: {
      userId,
      title: "Shorter 25-minute sessions (demo)",
      hypothesis: "Shorter sessions will help me start more often on tired evenings.",
      change: "Use 25-minute focus sessions with 5-minute breaks for two weeks.",
      metric: "Completed sessions per week",
      startAt: zonedToUtc(addDaysToKey(start, 50), "00:00", tz),
      endAt: zonedToUtc(addDaysToKey(start, 64), "00:00", tz),
      status: "COMPLETED",
      verdict: "HELPED",
      reflection: "Starting felt easier; I did 9 sessions in the trial weeks versus 6 before.",
      result: { before: 6, after: 9, unit: "sessions/week" },
      isDemo: true,
    },
  });

  // A saved opportunity to try gap analysis, tracking and tailoring on (example.org: placeholder by design).
  const demoDeadline = addDaysToKey(localDateKey(at, tz), 20);
  const opportunity = await prisma.opportunity.create({
    data: {
      ownerId: userId,
      sourceType: "MANUAL",
      sourceName: "example.org (demo)",
      sourceUrl: "https://example.org/demo/summer-research-internship",
      title: "Summer research internship — sensors lab (demo)",
      organisation: "Example Institute of Technology (demo)",
      kind: "INTERNSHIP",
      description: "Demonstration posting. Help a lab build and test low-cost temperature and strain sensors, and write up the results.",
      eligibility: "Enrolled in an undergraduate science or engineering course.",
      location: "Pune",
      workMode: "HYBRID",
      duration: "8 weeks",
      compensation: "₹8,000 a month (demo)",
      deadline: zonedToUtc(demoDeadline, "23:59", tz),
      requirements: ["Python", "Basic electronics", "Data plotting", "Report writing", "Enrolled in an undergraduate science or engineering course"],
      tags: ["read-by:STUDENT"],
      verification: "UNVERIFIED",
      isDemo: true,
    },
  });
  const application = await prisma.application.create({ data: { userId, opportunityId: opportunity.id } });
  await createEvent(
    userId,
    { title: `Deadline: ${opportunity.title}`, kind: "APPLICATION", dateKey: demoDeadline, startTime: "23:44", durationMinutes: 15, allDay: false, rrule: null, reminderMinutes: [24 * 60], showCountdown: true, isDeadline: true, applicationId: application.id },
    { isDemo: true },
  );

  await prisma.studentProfile.update({ where: { userId }, data: { demoDataLoadedAt: at } });
  return { topics: topics.length };
}

/** Removes every demonstration record for the student. */
export async function removeDemoData(userId: string) {
  await prisma.$transaction([
    prisma.xpEvent.deleteMany({ where: { userId, isDemo: true } }),
    prisma.practiceAttempt.deleteMany({ where: { userId, isDemo: true } }),
    prisma.studySession.deleteMany({ where: { userId, isDemo: true } }),
    prisma.journalEntry.deleteMany({ where: { userId, isDemo: true } }),
    prisma.achievement.deleteMany({ where: { userId, isDemo: true } }),
    prisma.opportunity.deleteMany({ where: { ownerId: userId, isDemo: true } }),
    prisma.experiment.deleteMany({ where: { userId, isDemo: true } }),
    prisma.mistake.deleteMany({ where: { userId, isDemo: true } }),
    prisma.goal.deleteMany({ where: { userId, isDemo: true } }),
    prisma.calendarEvent.deleteMany({ where: { userId, isDemo: true } }),
    prisma.revisionTask.deleteMany({ where: { userId, isDemo: true } }),
    prisma.reviewLog.deleteMany({ where: { userId, isDemo: true } }),
    prisma.subject.deleteMany({ where: { userId, isDemo: true } }),
    prisma.studentProfile.update({ where: { userId }, data: { demoDataLoadedAt: null } }),
  ]);
  // Badges are re-derived from the remaining (real) XP history.
  await prisma.userBadge.deleteMany({ where: { userId } });
}
