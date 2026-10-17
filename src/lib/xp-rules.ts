/**
 * XP rules — deliberately simple and explainable. Shown verbatim on My Progress.
 * Each award has a dedupe key so repeating the same action never re-awards it, and
 * some actions have daily caps so rapid repetition cannot inflate XP.
 */

export type XpActionName =
  | "STUDY_SESSION"
  | "PRACTICE_ATTEMPT"
  | "UNDERSTANDING_CHECK"
  | "REVISION_COMPLETE"
  | "FLASHCARD_REVIEW"
  | "MISTAKE_REVIEW"
  | "PROJECT_PROGRESS"
  | "ACHIEVEMENT_ADDED"
  | "PEER_HELP"
  | "CHECK_IN"
  | "REFLECTION"
  | "RETURN_AFTER_BREAK"
  | "MILESTONE"
  | "EXPERIMENT"
  | "SYLLABUS_CONFIRMED";

export const XP_RULES: Record<XpActionName, { points: number; dailyCap?: number; label: string; rule: string }> = {
  STUDY_SESSION: { points: 0, dailyCap: 120, label: "Focused study", rule: "1 XP per 5 focused minutes (sessions of 10+ min, up to 24 XP per session)" },
  PRACTICE_ATTEMPT: { points: 2, dailyCap: 60, label: "Practice", rule: "2 XP for each new question you answer (first attempt only)" },
  UNDERSTANDING_CHECK: { points: 25, label: "Understanding checked", rule: "25 XP the first time you pass a topic's understanding check" },
  REVISION_COMPLETE: { points: 10, dailyCap: 50, label: "Revision", rule: "10 XP for each scheduled revision you complete" },
  FLASHCARD_REVIEW: { points: 1, dailyCap: 40, label: "Flashcards", rule: "1 XP per card reviewed (up to 40 a day)" },
  MISTAKE_REVIEW: { points: 5, dailyCap: 30, label: "Mistake review", rule: "5 XP for revisiting a mistake; 10 more when you resolve it" },
  PROJECT_PROGRESS: { points: 15, dailyCap: 45, label: "Project progress", rule: "15 XP per completed project or exploration step" },
  ACHIEVEMENT_ADDED: { points: 20, label: "Portfolio", rule: "20 XP for each achievement you approve with evidence" },
  PEER_HELP: { points: 10, dailyCap: 30, label: "Helping peers", rule: "10 XP when another student marks your explanation helpful" },
  CHECK_IN: { points: 5, label: "Check-in", rule: "5 XP for your daily check-in (once a day)" },
  REFLECTION: { points: 10, label: "Reflection", rule: "10 XP for a written reflection of 40+ words (once a day)" },
  RETURN_AFTER_BREAK: { points: 15, label: "Welcome back", rule: "15 XP for coming back after 3+ days away — returning matters more than streaks" },
  MILESTONE: { points: 20, label: "Milestone", rule: "20 XP for each goal milestone you complete" },
  EXPERIMENT: { points: 15, label: "Personal experiment", rule: "15 XP for finishing a study experiment and reflecting on it" },
  SYLLABUS_CONFIRMED: { points: 20, label: "Syllabus mapped", rule: "20 XP for confirming a syllabus" },
};

/** Focus-session XP: 1 per 5 minutes, sessions under 10 minutes earn nothing, max 24. */
export function sessionPoints(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 10) return 0;
  return Math.min(24, Math.floor(minutes / 5));
}

/** Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, 1500… */
export function levelForXp(xp: number) {
  const level = Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / 100)) / 2);
  const start = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, start, next, progress: (xp - start) / (next - start) };
}

/** Apply a daily cap: how many of `points` may still be awarded given what was earned today. */
export function cappedPoints(points: number, earnedToday: number, cap?: number): number {
  if (cap === undefined) return points;
  return Math.max(0, Math.min(points, cap - earnedToday));
}

export const RETURN_GAP_DAYS = 3;

export type BadgeDef = { code: string; name: string; description: string; icon: string };

export const BADGES: BadgeDef[] = [
  { code: "first-step", name: "First step", description: "Earned your first XP", icon: "footprints" },
  { code: "syllabus-mapped", name: "Syllabus mapped", description: "Confirmed your first syllabus", icon: "map" },
  { code: "understanding-5", name: "Five topics understood", description: "Passed 5 understanding checks", icon: "lightbulb" },
  { code: "revision-rhythm", name: "Revision rhythm", description: "Completed 5 scheduled revisions", icon: "repeat" },
  { code: "mistake-hunter", name: "Mistake hunter", description: "Revisited 5 mistakes", icon: "search-check" },
  { code: "helpful-peer", name: "Helpful peer", description: "An explanation of yours was marked helpful", icon: "hand-heart" },
  { code: "comeback", name: "Comeback", description: "Came back after a break — the hardest step", icon: "sunrise" },
  { code: "steady-week", name: "Steady fortnight", description: "Active on 7 different days within 14 days", icon: "calendar-check" },
  { code: "reflective", name: "Reflective", description: "Wrote 5 reflections", icon: "notebook-pen" },
  { code: "experimenter", name: "Experimenter", description: "Completed a personal study experiment", icon: "flask-conical" },
  { code: "portfolio-builder", name: "Portfolio builder", description: "Approved 3 achievements with evidence", icon: "briefcase" },
];
