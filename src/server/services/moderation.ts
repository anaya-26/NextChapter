import "server-only";
import { Prisma, type FlagReason, type FlagTarget } from "@/generated/prisma/client";
import { autoHideThreshold } from "@/lib/community-safety";
import { SUPPORT_LINES } from "@/lib/wellbeing";
import { prisma } from "../db";
import { CommunityError, communityAccess, getPost } from "./community";

/**
 * Reports and moderation. Reported content is hidden for review once enough students report
 * it (sooner in spaces with younger students); a self-harm report hides it at once and sends
 * the author support details. Moderators act from a queue; every decision is recorded.
 */

export const FLAG_REASONS: { value: FlagReason; label: string }[] = [
  { value: "INCORRECT", label: "Incorrect or outdated" },
  { value: "SPAM", label: "Spam or advertising" },
  { value: "HARASSMENT", label: "Bullying or harassment" },
  { value: "INAPPROPRIATE", label: "Not appropriate for students" },
  { value: "PRIVACY", label: "Shares someone’s personal details" },
  { value: "SELF_HARM", label: "Someone may be in danger" },
  { value: "OTHER", label: "Something else" },
];

export async function report(userId: string, input: { targetType: FlagTarget; targetId: string; reason: FlagReason; details: string | null }, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.member || a.needsConsent) throw new CommunityError("Join the community first.");
  // The reporter must be able to see what they report.
  let postId: string | null = null;
  let audience: "ALL_AGES" | "TEENS" | "ADULTS" = "ALL_AGES";
  let authorId: string | null = null;
  if (input.targetType === "POST" || input.targetType === "RESOURCE") {
    const p = await getPost(userId, input.targetId, at);
    if (!p) throw new CommunityError("Not found");
    postId = p.id;
    audience = p.group.audience;
    authorId = p.author.id;
    if (input.targetType === "RESOURCE" && p.kind !== "RESOURCE") throw new CommunityError("Only resource posts can be flagged as resources");
  } else if (input.targetType === "COMMENT") {
    const c = await prisma.comment.findUnique({ where: { id: input.targetId }, select: { postId: true, authorId: true } });
    const p = c ? await getPost(userId, c.postId, at) : null;
    if (!c || !p) throw new CommunityError("Not found");
    audience = p.group.audience;
    authorId = c.authorId;
  } else {
    const target = await prisma.communityProfile.findUnique({ where: { handle: input.targetId } });
    if (!target) throw new CommunityError("Member not found");
    authorId = target.userId;
    input = { ...input, targetId: target.userId };
  }
  if (authorId === userId) throw new CommunityError("You can delete your own posts instead of reporting them.");
  try {
    await prisma.contentFlag.create({ data: { reporterId: userId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details, createdAt: at } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { hidden: false, duplicate: true };
    throw e;
  }
  let hidden = false;
  if (input.targetType === "POST" || input.targetType === "RESOURCE") {
    const p = await prisma.post.update({
      where: { id: postId! },
      data: { reportCount: { increment: input.reason === "INCORRECT" ? 0 : 1 }, incorrectFlagCount: { increment: input.reason === "INCORRECT" ? 1 : 0 } },
    });
    if (input.reason === "SELF_HARM" || p.reportCount >= autoHideThreshold(audience)) {
      await prisma.post.update({ where: { id: p.id }, data: { status: "PENDING_REVIEW" } });
      hidden = true;
    }
  } else if (input.targetType === "COMMENT") {
    const c = await prisma.comment.update({ where: { id: input.targetId }, data: { reportCount: { increment: input.reason === "INCORRECT" ? 0 : 1 } } });
    if (input.reason === "SELF_HARM" || c.reportCount >= autoHideThreshold(audience)) {
      await prisma.comment.update({ where: { id: c.id }, data: { status: "PENDING_REVIEW" } });
      hidden = true;
    }
  }
  if (input.reason === "SELF_HARM" && authorId) {
    await prisma.notification.upsert({
      where: { userId_dedupeKey: { userId: authorId, dedupeKey: `care:${input.targetId}` } },
      create: {
        userId: authorId,
        kind: "SYSTEM",
        title: "Someone in the community is thinking of you",
        body: `If things feel hard right now, please talk to someone you trust. ${SUPPORT_LINES.map((s) => `${s.name}: ${s.contact}`).join(" · ")}.`,
        link: "/journal?support=1",
        dueAt: at,
        dedupeKey: `care:${input.targetId}`,
      },
      update: {},
    });
  }
  return { hidden, duplicate: false };
}

async function requireModerator(userId: string) {
  const cp = await prisma.communityProfile.findUnique({ where: { userId } });
  if (!cp?.isModerator) throw new CommunityError("Moderators only");
}

/** Open reports, grouped by target, with the content shown to the moderator. Distress first. */
export async function moderationQueue(userId: string) {
  await requireModerator(userId);
  const flags = await prisma.contentFlag.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 200 });
  const groups = new Map<string, typeof flags>();
  for (const f of flags) groups.set(`${f.targetType}:${f.targetId}`, [...(groups.get(`${f.targetType}:${f.targetId}`) ?? []), f]);
  const items = await Promise.all(
    [...groups.entries()].map(async ([key, fs]) => {
      const { targetType, targetId } = fs[0];
      const post = targetType === "POST" || targetType === "RESOURCE" ? await prisma.post.findUnique({ where: { id: targetId }, include: { author: { select: { communityProfile: { select: { handle: true } } } }, group: { select: { name: true, audience: true } } } }) : null;
      const comment = targetType === "COMMENT" ? await prisma.comment.findUnique({ where: { id: targetId }, include: { author: { select: { communityProfile: { select: { handle: true } } } }, post: { select: { id: true, title: true, group: { select: { name: true, audience: true } } } } } }) : null;
      const member = targetType === "USER" ? await prisma.communityProfile.findUnique({ where: { userId: targetId } }) : null;
      return {
        key,
        targetType,
        targetId,
        reasons: [...new Set(fs.map((f) => f.reason))],
        details: fs.map((f) => f.details).filter((d): d is string => !!d),
        count: fs.length,
        firstAt: fs[0].createdAt,
        content: post
          ? { title: post.title, body: post.body, handle: post.author.communityProfile?.handle ?? "—", where: `${post.group.name} (${post.group.audience})`, status: post.status, link: `/community/posts/${post.id}` }
          : comment
            ? { title: `Reply on “${comment.post.title}”`, body: comment.body, handle: comment.author.communityProfile?.handle ?? "—", where: `${comment.post.group.name} (${comment.post.group.audience})`, status: comment.status, link: `/community/posts/${comment.post.id}` }
            : member
              ? { title: `Member ${member.handle}`, body: member.bio ?? "", handle: member.handle, where: "Profile", status: member.suspendedUntil ? "SUSPENDED" : "ACTIVE", link: null }
              : null,
      };
    }),
  );
  return items.filter((i) => i.content).sort((a, b) => Number(b.reasons.includes("SELF_HARM")) - Number(a.reasons.includes("SELF_HARM")) || a.firstAt.getTime() - b.firstAt.getTime());
}

export type ModAction = "REMOVE" | "RESTORE" | "DISMISS" | "SUSPEND";

export async function moderate(userId: string, input: { targetType: FlagTarget; targetId: string; action: ModAction; note: string | null }, at: Date) {
  await requireModerator(userId);
  const isPost = input.targetType === "POST" || input.targetType === "RESOURCE";
  let authorId: string | null = input.targetType === "USER" ? input.targetId : null;
  if (isPost) authorId = (await prisma.post.findUnique({ where: { id: input.targetId }, select: { authorId: true } }))?.authorId ?? null;
  if (input.targetType === "COMMENT") authorId = (await prisma.comment.findUnique({ where: { id: input.targetId }, select: { authorId: true } }))?.authorId ?? null;
  if (authorId === userId) throw new CommunityError("Another moderator should review reports about your own content.");
  const status = input.action === "RESTORE" || input.action === "DISMISS" ? "VISIBLE" : "REMOVED";
  if (input.targetType !== "USER") {
    if (isPost) await prisma.post.updateMany({ where: { id: input.targetId }, data: { status, ...(status === "VISIBLE" ? { reportCount: 0 } : {}) } });
    else await prisma.comment.updateMany({ where: { id: input.targetId }, data: { status, ...(status === "VISIBLE" ? { reportCount: 0 } : {}) } });
  }
  if (input.action === "SUSPEND" && authorId) await prisma.communityProfile.updateMany({ where: { userId: authorId }, data: { suspendedUntil: new Date(at.getTime() - 0 + 7 * 86400000) } });
  await prisma.contentFlag.updateMany({
    where: { targetType: input.targetType === "RESOURCE" ? { in: ["RESOURCE", "POST"] } : input.targetType, targetId: input.targetId, status: "OPEN" },
    data: { status: input.action === "DISMISS" || input.action === "RESTORE" ? "DISMISSED" : "ACTIONED", reviewedById: userId, reviewedAt: at, resolutionNote: input.note },
  });
  if (authorId && (input.action === "REMOVE" || input.action === "SUSPEND")) {
    await prisma.notification.create({
      data: { userId: authorId, kind: "COMMUNITY", title: input.action === "SUSPEND" ? "Your posting is paused for 7 days" : "A moderator removed something you posted", body: input.note ?? "It didn’t follow the community guidelines.", link: "/community/profile", dueAt: at },
    });
  }
}

/** Development/demo helper — production moderators are appointed by an administrator in the database. */
export async function setModerator(userId: string, on: boolean) {
  await prisma.communityProfile.updateMany({ where: { userId }, data: { isModerator: on } });
}
