import * as chrono from "chrono-node";
import { addDaysToKey, zonedParts } from "./time";

/**
 * Rule-based reading of "Chemistry test on 23/10 at 10am" or "coaching every Mon and Wed
 * 5-7pm". Used when AI isn't configured (and as a cross-check). Day-first dates (Indian
 * style) and a few common Hindi/Marathi time words are understood. The result is always a
 * draft the student reviews before anything is saved.
 */

export type EventKindName = "CLASS" | "ASSIGNMENT" | "EXAM" | "REVISION" | "STUDY" | "PROJECT" | "FOCUS" | "APPLICATION" | "PERSONAL" | "REMINDER";

export type ScheduleDraft = {
  title: string;
  kind: EventKindName;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  allDay: boolean;
  recurrence: { freq: "DAILY" | "WEEKLY"; days: number[]; untilKey: string | null } | null;
  isDeadline: boolean;
  showCountdown: boolean;
  reminderMinutes: number[];
  assumptions: string[];
};

const KIND_WORDS: [EventKindName, RegExp][] = [
  ["EXAM", /\b(exam|exams|test|quiz|viva|boards?|paper|mid-?sem|end-?sem|olympiad|jee|neet|cuet|cat|gate|upsc)\b|परीक्षा|परिक्षा/i],
  ["ASSIGNMENT", /\b(assignment|homework|hw|submit|submission|due|deadline|report|journal file|practical file|lab record)\b/i],
  ["APPLICATION", /\b(apply|application|internship|scholarship|form)\b/i],
  ["REVISION", /\b(revise|revision|recap|go over)\b/i],
  ["CLASS", /\b(class|classes|lecture|coaching|tuition|tutorial|lab|practical)\b|क्लास/i],
  ["PROJECT", /\b(project|hackathon|build)\b/i],
  ["FOCUS", /\b(focus|pomodoro|deep work)\b/i],
  ["REMINDER", /\b(remind me|reminder)\b/i],
  ["STUDY", /\b(study|studying|read|practice|practise|solve|learn|chapter|numericals)\b|पढ़ाई|अभ्यास/i],
];

const DEFAULT_MINUTES: Record<EventKindName, number> = {
  CLASS: 60,
  ASSIGNMENT: 15,
  EXAM: 180,
  REVISION: 30,
  STUDY: 45,
  PROJECT: 60,
  FOCUS: 25,
  APPLICATION: 15,
  PERSONAL: 60,
  REMINDER: 15,
};

const DEFAULT_REMINDERS: Record<EventKindName, number[]> = {
  CLASS: [15],
  ASSIGNMENT: [1440, 120],
  EXAM: [1440, 60],
  REVISION: [10],
  STUDY: [10],
  PROJECT: [30],
  FOCUS: [5],
  APPLICATION: [1440],
  PERSONAL: [30],
  REMINDER: [0],
};

const WEEKDAYS: [RegExp, number][] = [
  [/\bsun(day)?s?\b/i, 0],
  [/\bmon(day)?s?\b/i, 1],
  [/\btue(s|sday)?s?\b/i, 2],
  [/\bwed(nesday)?s?\b/i, 3],
  [/\bthu(r|rs|rsday)?s?\b/i, 4],
  [/\bfri(day)?s?\b/i, 5],
  [/\bsat(urday)?s?\b/i, 6],
];

/** Common Hindi/Marathi (romanised and Devanagari) scheduling words → English. */
function translateIndic(text: string): { text: string; ambiguousHour: boolean } {
  let ambiguousHour = false;
  let t = text
    .replace(/\b(aaj|aj)\b|आज/gi, "today")
    .replace(/\b(kal|udya|udyaa)\b|कल|उद्या/gi, "tomorrow")
    .replace(/\b(parso|parva)\b|परसों|परवा/gi, "in 2 days")
    .replace(/\b(subah|sakali)\s+(\d{1,2})(?::(\d{2}))?\s*(baje|vajta)?/gi, (_, __, h, m) => `${h}${m ? `:${m}` : ""}am`)
    .replace(/\b(shaam|sham|sandhyakali|raat|ratri)\s+(\d{1,2})(?::(\d{2}))?\s*(baje|vajta)?/gi, (_, __, h, m) => `${h}${m ? `:${m}` : ""}pm`)
    .replace(/सुबह\s*(\d{1,2})\s*बजे/g, (_, h) => `${h}am`)
    .replace(/(शाम|रात)\s*(\d{1,2})\s*बजे/g, (_, __, h) => `${h}pm`);
  t = t.replace(/(\d{1,2})(?::(\d{2}))?\s*(baje|vajta|बजे|वाजता)/gi, (_, h, m) => {
    const hour = Number(h);
    if (hour >= 1 && hour <= 7) {
      ambiguousHour = true;
      return `${hour}${m ? `:${m}` : ""}pm`;
    }
    return `${hour}${m ? `:${m}` : ":00"}`;
  });
  return { text: t, ambiguousHour };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function parseScheduleText(input: string, now: Date, tz: string): ScheduleDraft | null {
  const assumptions: string[] = [];
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const translated = translateIndic(raw);
  let text = translated.text;
  if (translated.ambiguousHour) assumptions.push("Read the time as evening — change it if you meant morning.");

  // Duration ("for 45 min", "for 1.5 hours", "for 1h30").
  let duration: number | null = null;
  text = text.replace(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?:\s*(\d+)\s*(m|min|mins|minutes)?)?\b|\bfor\s+(\d+)\s*(m|min|mins|minutes)\b/i, (_, h, __, hm, ___, m) => {
    duration = h ? Math.round(Number(h) * 60 + (hm ? Number(hm) : 0)) : Number(m);
    return " ";
  });

  // Repetition ("every Monday and Wednesday", "daily", "on weekdays", "until 30/11").
  let untilKey: string | null = null;
  const reference = (() => {
    const p = zonedParts(now, tz);
    return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  })();
  text = text.replace(/\b(until|till|upto|up to)\s+(.+?)(?=$|,|\.)/i, (match, _w, rest) => {
    const r = chrono.en.GB.parse(rest, { instant: reference, timezone: 0 }, { forwardDate: true })[0];
    if (!r) return match;
    untilKey = `${r.start.get("year")}-${pad(r.start.get("month")!)}-${pad(r.start.get("day")!)}`;
    return " ";
  });
  let recurrence: ScheduleDraft["recurrence"] = null;
  if (/\b(every ?day|daily|each day|roz|rozana|रोज़?|दररोज)\b/i.test(text)) {
    recurrence = { freq: "DAILY", days: [], untilKey };
    text = text.replace(/\b(every ?day|daily|each day|roz|rozana)\b|रोज़?|दररोज/gi, " ");
  } else if (/\b(on )?weekdays\b|\bevery weekday\b/i.test(text)) {
    recurrence = { freq: "WEEKLY", days: [1, 2, 3, 4, 5], untilKey };
    text = text.replace(/\b(on )?weekdays\b|\bevery weekday\b/gi, " ");
  } else if (/\b(every|each)\b/i.test(text) || /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?s\b/i.test(text)) {
    const days = WEEKDAYS.filter(([re]) => re.test(text)).map(([, d]) => d);
    if (days.length) {
      recurrence = { freq: "WEEKLY", days, untilKey };
      for (const [re] of WEEKDAYS) text = text.replace(new RegExp(re.source, "gi"), " ");
      text = text.replace(/\b(every|each)\b/gi, " ").replace(/\b(and|&|,)\s*(?=\b(and|&)\b|$)/gi, " ");
    }
  }

  const results = chrono.en.GB.parse(text, { instant: reference, timezone: 0 }, { forwardDate: true });
  const dated = results.find((r) => r.start.isCertain("day") || r.start.isCertain("weekday")) ?? results[0];
  const timed = results.find((r) => r.start.isCertain("hour")) ?? null;

  let dateKey: string;
  if (dated) dateKey = `${dated.start.get("year")}-${pad(dated.start.get("month")!)}-${pad(dated.start.get("day")!)}`;
  else if (recurrence?.freq === "WEEKLY") {
    // First matching weekday from today.
    const todayKey = reference.toISOString().slice(0, 10);
    let k = todayKey;
    for (let i = 0; i < 7; i++) {
      k = addDaysToKey(todayKey, i);
      if (recurrence.days.includes(new Date(`${k}T00:00:00Z`).getUTCDay())) break;
    }
    dateKey = k;
  } else {
    dateKey = reference.toISOString().slice(0, 10);
    if (!timed) assumptions.push("No date found — set for today.");
  }

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (timed) {
    startTime = `${pad(timed.start.get("hour")!)}:${pad(timed.start.get("minute") ?? 0)}`;
    if (timed.end?.isCertain("hour") || timed.end?.get("hour") != null) endTime = `${pad(timed.end!.get("hour")!)}:${pad(timed.end!.get("minute") ?? 0)}`;
    if (!dated || dated === timed) {
      dateKey = `${timed.start.get("year")}-${pad(timed.start.get("month")!)}-${pad(timed.start.get("day")!)}`;
    }
  }

  // Kind and title.
  const lower = raw.toLowerCase();
  const kind: EventKindName = KIND_WORDS.find(([, re]) => re.test(lower))?.[0] ?? (startTime ? "PERSONAL" : "REMINDER");
  let title = text;
  for (const r of results) title = title.replace(r.text, " ");
  title = title
    .replace(/\b(remind me to|remind me|add|schedule|plan|put|set up|create)\b/gi, " ")
    .replace(/\b(at|on|by|from|to|in|tonight|today|tomorrow)\b\s*$/gi, " ")
    .replace(/\s+(on|at|by|from|due)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
  for (let i = 0; i < 3; i++) title = title.replace(/(^|\s)(on|at|by|from|in|and|&|,)\s*$/i, "").replace(/^(and|&|,)\s+/i, "").trim();
  if (!title) title = kind === "EXAM" ? "Exam" : kind === "ASSIGNMENT" ? "Assignment due" : "Study";
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const isDeadline = kind === "ASSIGNMENT" || kind === "APPLICATION";
  let allDay = false;
  if (!startTime) {
    if (isDeadline) {
      startTime = "23:59";
      assumptions.push("No time given — treated as due by 11:59 pm.");
    } else if (kind === "EXAM") {
      allDay = true;
      assumptions.push("No time given — added as an all-day exam.");
    } else {
      startTime = "18:00";
      assumptions.push("No time given — suggested 6 pm.");
    }
  }
  let durationMinutes = duration ?? DEFAULT_MINUTES[kind];
  if (startTime && endTime) {
    const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
    let diff = toMin(endTime) - toMin(startTime);
    if (diff <= 0) diff += 1440;
    durationMinutes = diff;
  }
  if (isDeadline && !duration && !endTime) durationMinutes = 15;

  return {
    title: title.slice(0, 120),
    kind,
    dateKey,
    startTime: allDay ? null : startTime,
    endTime: allDay ? null : endTime,
    durationMinutes,
    allDay,
    recurrence,
    isDeadline,
    showCountdown: kind === "EXAM" || isDeadline,
    reminderMinutes: DEFAULT_REMINDERS[kind],
    assumptions,
  };
}
