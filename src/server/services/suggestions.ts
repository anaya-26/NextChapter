import "server-only";
import { addDaysToKey, localDateKey } from "@/lib/time";
import { prisma } from "../db";
import { getProfile } from "./profile";
import { preferredStartTime, scheduleRevision } from "./revision";
import { proposeExperiment } from "./experiments";

/**
 * Suggested next steps from the journal, weekly reviews and the planner. Each is a proposal:
 * accepting performs one concrete action (or opens the right page); dismissing hides it.
 */

type Payload = { topicId?: string | null; subjectId?: string | null; templateId?: string | null };

export async function openSuggestions(userId: string, opts: { origin?: "JOURNAL" | "WEEKLY_REVIEW"; sourceId?: string } = {}) {
  return prisma.suggestedAction.findMany({
    where: { userId, status: "PROPOSED", actionType: { not: "OBSTACLE_DISCUSSION" }, ...(opts.origin ? { origin: opts.origin } : {}), ...(opts.sourceId ? { sourceId: opts.sourceId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function acceptSuggestion(userId: string, id: string, at: Date): Promise<{ href: string; message: string }> {
  const s = await prisma.suggestedAction.findFirst({ where: { id, userId, status: "PROPOSED" } });
  if (!s) throw new Error("This suggestion is no longer available");
  const p = (s.payload ?? {}) as Payload;
  const topicHref = p.topicId && p.subjectId ? `/learn/${p.subjectId}/topics/${p.topicId}` : "/learn";
  let out: { href: string; message: string };
  switch (s.actionType) {
    case "SCHEDULE_REVISION": {
      if (!p.topicId) throw new Error("Topic missing");
      const profile = await getProfile(userId);
      await scheduleRevision(userId, { topicId: p.topicId, dateKey: addDaysToKey(localDateKey(at, profile.timezone), 1), time: preferredStartTime(profile.preferredStudyTimes) }, at);
      out = { href: `${topicHref}?tab=revise`, message: "Revision scheduled for tomorrow" };
      break;
    }
    case "REVISIT_TOPIC":
      out = { href: topicHref, message: "Opening the topic" };
      break;
    case "PRACTICE_TOPIC":
      out = { href: `${topicHref}?tab=practice`, message: "Opening practice" };
      break;
    case "REVIEW_MISTAKES":
      out = { href: p.topicId ? `/learn/mistakes?topic=${p.topicId}` : "/learn/mistakes", message: "Opening your mistake library" };
      break;
    case "PLAN_WEEK":
      out = { href: "/calendar/plan", message: "Opening the planner" };
      break;
    case "START_EXPERIMENT": {
      const exp = await proposeExperiment(userId, { templateId: p.templateId ?? "evening-sessions" }, "RULES");
      out = { href: `/progress/experiments#${exp.id}`, message: "Experiment ready to start" };
      break;
    }
    case "TALK_TO_SOMEONE":
      out = { href: "/journal?support=1", message: "Support options" };
      break;
    default:
      out = { href: "/today", message: "Noted — rest is part of the plan" };
  }
  await prisma.suggestedAction.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: at } });
  return out;
}

export async function dismissSuggestion(userId: string, id: string, at: Date) {
  const res = await prisma.suggestedAction.updateMany({ where: { id, userId, status: "PROPOSED" }, data: { status: "DISMISSED", resolvedAt: at } });
  return res.count === 1;
}
