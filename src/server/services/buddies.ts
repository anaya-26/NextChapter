import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { contactInfoReason } from "@/lib/community-safety";
import { prisma } from "../db";
import { CommunityError, blockedIds, communityAccess } from "./community";

/**
 * Study buddies: students who chose to be discoverable can pair up for accountability. Only
 * within the same age bracket (adults with adults, 13–17 with 13–17); not available under 13.
 * Buddies see each other's handle and shared groups — nothing from private profiles.
 */

function bracket(ageBand: string | null | undefined) {
  if (ageBand === "ADULT") return "ADULT" as const;
  if (ageBand === "TEEN_13_15" || ageBand === "TEEN_16_17") return "TEEN" as const;
  return null;
}

const bandsFor = (b: "ADULT" | "TEEN") => (b === "ADULT" ? (["ADULT"] as const) : (["TEEN_13_15", "TEEN_16_17"] as const));

async function requireBuddyAccess(userId: string, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.canPost) throw new CommunityError("Join the community first.");
  const b = bracket(a.ageBand);
  if (!b) throw new CommunityError("Study buddies are for students aged 13 and over who have set their age band in Settings.");
  return { ...a, bracket: b };
}

export async function buddySuggestions(userId: string, at: Date) {
  const a = await communityAccess(userId, at);
  const b = bracket(a.ageBand);
  if (!a.member || a.needsConsent || !b) return [];
  const [myGroups, blocked, existing] = await Promise.all([
    prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
    blockedIds(userId),
    prisma.studyBuddyRequest.findMany({ where: { OR: [{ requesterId: userId }, { recipientId: userId }], status: { in: ["PENDING", "ACCEPTED"] } }, select: { requesterId: true, recipientId: true } }),
  ]);
  const exclude = new Set([userId, ...blocked, ...existing.flatMap((e) => [e.requesterId, e.recipientId])]);
  const rows = await prisma.groupMember.findMany({
    where: {
      groupId: { in: myGroups.map((g) => g.groupId) },
      userId: { notIn: [...exclude] },
      user: { privacy: { communityVisible: true }, profile: { ageBand: { in: [...bandsFor(b)] } }, communityProfile: { isNot: null } },
    },
    include: { group: { select: { name: true } }, user: { select: { communityProfile: { select: { handle: true, bio: true, suspendedUntil: true } } } } },
    take: 100,
  });
  const byUser = new Map<string, { handle: string; bio: string | null; groups: string[] }>();
  for (const r of rows) {
    const cp = r.user.communityProfile;
    if (!cp || (cp.suspendedUntil && cp.suspendedUntil > at)) continue;
    const cur = byUser.get(r.userId) ?? { handle: cp.handle, bio: cp.bio, groups: [] };
    cur.groups.push(r.group.name);
    byUser.set(r.userId, cur);
  }
  return [...byUser.values()].sort((x, y) => y.groups.length - x.groups.length).slice(0, 12);
}

export async function requestBuddy(userId: string, handle: string, message: string | null, at: Date) {
  const a = await requireBuddyAccess(userId, at);
  if (message && contactInfoReason(message)) throw new CommunityError("Messages can’t include contact details.");
  const target = await prisma.communityProfile.findUnique({ where: { handle }, include: { user: { select: { profile: { select: { ageBand: true } }, privacy: { select: { communityVisible: true } } } } } });
  if (!target || target.userId === userId || !target.user.privacy?.communityVisible || bracket(target.user.profile?.ageBand) !== a.bracket) throw new CommunityError("This student isn’t available as a study buddy.");
  if ((await blockedIds(userId)).includes(target.userId)) throw new CommunityError("This student isn’t available as a study buddy.");
  const reverse = await prisma.studyBuddyRequest.findUnique({ where: { requesterId_recipientId: { requesterId: target.userId, recipientId: userId } } });
  if (reverse?.status === "PENDING") return respondBuddy(userId, reverse.id, true, at);
  try {
    const req = await prisma.studyBuddyRequest.upsert({
      where: { requesterId_recipientId: { requesterId: userId, recipientId: target.userId } },
      create: { requesterId: userId, recipientId: target.userId, message, createdAt: at },
      update: { status: "PENDING", message, createdAt: at, respondedAt: null },
    });
    await prisma.notification.create({ data: { userId: target.userId, kind: "COMMUNITY", title: `${a.member!.handle} would like to be study buddies`, body: message, link: "/community/buddies", dueAt: at } });
    return req;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) throw new CommunityError("Couldn’t send the request");
    throw e;
  }
}

export async function respondBuddy(userId: string, requestId: string, accept: boolean, at: Date) {
  await requireBuddyAccess(userId, at);
  const req = await prisma.studyBuddyRequest.findFirst({ where: { id: requestId, recipientId: userId, status: "PENDING" }, include: { recipient: { select: { communityProfile: { select: { handle: true } } } } } });
  if (!req) throw new CommunityError("Request not found");
  const updated = await prisma.studyBuddyRequest.update({ where: { id: req.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: at } });
  if (accept) await prisma.notification.create({ data: { userId: req.requesterId, kind: "COMMUNITY", title: `${req.recipient.communityProfile?.handle ?? "A student"} accepted your study buddy request`, link: "/community/buddies", dueAt: at } });
  return updated;
}

export async function endBuddy(userId: string, requestId: string, at: Date) {
  await prisma.studyBuddyRequest.updateMany({ where: { id: requestId, OR: [{ requesterId: userId }, { recipientId: userId }], status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED", respondedAt: at } });
}

export async function listBuddies(userId: string) {
  const rows = await prisma.studyBuddyRequest.findMany({
    where: { OR: [{ requesterId: userId }, { recipientId: userId }], status: { in: ["PENDING", "ACCEPTED"] } },
    include: { requester: { select: { communityProfile: { select: { handle: true } } } }, recipient: { select: { communityProfile: { select: { handle: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const other = (r: (typeof rows)[number]) => (r.requesterId === userId ? r.recipient : r.requester).communityProfile?.handle ?? "former member";
  return {
    buddies: rows.filter((r) => r.status === "ACCEPTED").map((r) => ({ id: r.id, handle: other(r) })),
    incoming: rows.filter((r) => r.status === "PENDING" && r.recipientId === userId).map((r) => ({ id: r.id, handle: other(r), message: r.message })),
    outgoing: rows.filter((r) => r.status === "PENDING" && r.requesterId === userId).map((r) => ({ id: r.id, handle: other(r) })),
  };
}
