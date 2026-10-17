import "server-only";
import type { GroupAudience } from "@/generated/prisma/client";
import { prisma } from "../db";
import { CommunityError, communityAccess } from "./community";
import { contactInfoReason } from "@/lib/community-safety";
import { startAdHocSession } from "./sessions";

/**
 * Focus rooms: study "together" by presence only — handles and a one-line goal, a shared
 * timer, no chat, no camera. Low-risk for younger students and light on bandwidth.
 */

export const HERE_NOW_MS = 2 * 60_000;

export function roomPhase(room: { startsAt: Date; durationMinutes: number }, at: Date) {
  const end = room.startsAt.getTime() + room.durationMinutes * 60_000;
  return at < room.startsAt ? "SCHEDULED" : at.getTime() < end ? "LIVE" : "ENDED";
}

export async function listRooms(userId: string, at: Date, groupId?: string) {
  const a = await communityAccess(userId, at);
  if (!a.member || a.needsConsent) return [];
  const rooms = await prisma.focusRoom.findMany({
    where: { audience: { in: a.audiences }, status: { not: "ENDED" }, startsAt: { lte: new Date(at.getTime() + 7 * 86400000) }, ...(groupId ? { groupId } : {}) },
    include: { host: { select: { communityProfile: { select: { handle: true } } } }, group: { select: { slug: true, name: true } }, participants: { where: { leftAt: null, lastSeenAt: { gte: new Date(at.getTime() - HERE_NOW_MS) } }, select: { userId: true } } },
    orderBy: { startsAt: "asc" },
    take: 30,
  });
  return rooms.filter((r) => roomPhase(r, at) !== "ENDED").map((r) => ({ ...r, phase: roomPhase(r, at), hereNow: r.participants.length, joined: r.participants.some((p) => p.userId === userId) }));
}

export async function getRoom(userId: string, roomId: string, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.member || a.needsConsent) return null;
  const room = await prisma.focusRoom.findFirst({
    where: { id: roomId, audience: { in: a.audiences } },
    include: {
      host: { select: { communityProfile: { select: { handle: true } } } },
      group: { select: { slug: true, name: true } },
      participants: { where: { leftAt: null }, include: { user: { select: { communityProfile: { select: { handle: true } } } } }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!room) return null;
  const blocked = new Set((await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } })).map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
  return {
    ...room,
    phase: roomPhase(room, at),
    endsAt: new Date(room.startsAt.getTime() + room.durationMinutes * 60_000),
    present: room.participants.filter((p) => !blocked.has(p.userId) && p.lastSeenAt.getTime() >= at.getTime() - HERE_NOW_MS).map((p) => ({ handle: p.user.communityProfile?.handle ?? "member", goal: p.goalText, me: p.userId === userId })),
    me: room.participants.find((p) => p.userId === userId) ?? null,
  };
}

export async function createRoom(userId: string, input: { title: string; startsAt: Date; durationMinutes: number; groupId: string | null }, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.canPost) throw new CommunityError(a.needsConsent ? "Guardian consent is needed first." : a.suspendedUntil ? "Posting is paused for now." : "Join the community first.");
  if (contactInfoReason(input.title)) throw new CommunityError("Room titles can’t include contact details.");
  if (input.durationMinutes < 15 || input.durationMinutes > 180) throw new CommunityError("Rooms run for 15 minutes to 3 hours.");
  if (input.startsAt.getTime() < at.getTime() - 5 * 60_000 || input.startsAt.getTime() > at.getTime() + 7 * 86400000) throw new CommunityError("Pick a start time within the next week.");
  let audience: GroupAudience;
  if (input.groupId) {
    const g = await prisma.group.findFirst({ where: { id: input.groupId, audience: { in: a.audiences } } });
    if (!g) throw new CommunityError("Group not found");
    audience = g.audience;
  } else if (a.ageBand === "ADULT") audience = "ADULTS";
  else if (a.ageBand === "TEEN_13_15" || a.ageBand === "TEEN_16_17") audience = "TEENS";
  else throw new CommunityError("Start a room inside one of your groups.");
  return prisma.focusRoom.create({ data: { hostId: userId, groupId: input.groupId, title: input.title, startsAt: input.startsAt, durationMinutes: input.durationMinutes, audience, createdAt: at } });
}

/** Joining shows your handle and goal to others in the room and starts your own focus session. */
export async function joinRoom(userId: string, roomId: string, goalText: string | null, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.canPost) throw new CommunityError("Join the community first.");
  const room = await getRoom(userId, roomId, at);
  if (!room) throw new CommunityError("Room not found");
  if (room.phase === "ENDED") throw new CommunityError("This room has ended.");
  if (goalText && contactInfoReason(goalText)) throw new CommunityError("Goals can’t include contact details.");
  await prisma.focusParticipant.upsert({ where: { roomId_userId: { roomId, userId } }, create: { roomId, userId, goalText, joinedAt: at, lastSeenAt: at }, update: { goalText, lastSeenAt: at, leftAt: null } });
  const minutesLeft = Math.max(15, Math.round((room.endsAt.getTime() - Math.max(at.getTime(), room.startsAt.getTime())) / 60_000));
  const session = await startAdHocSession(userId, { title: room.title, plannedMinutes: Math.min(minutesLeft, room.durationMinutes) }, at);
  await prisma.studySession.update({ where: { id: session.id }, data: { focusRoomId: roomId } });
  return session;
}

export async function heartbeat(userId: string, roomId: string, at: Date) {
  await prisma.focusParticipant.updateMany({ where: { roomId, userId, leftAt: null }, data: { lastSeenAt: at } });
}

export async function leaveRoom(userId: string, roomId: string, at: Date) {
  await prisma.focusParticipant.updateMany({ where: { roomId, userId }, data: { leftAt: at } });
}

export async function endRoom(userId: string, roomId: string) {
  await prisma.focusRoom.updateMany({ where: { id: roomId, hostId: userId }, data: { status: "ENDED" } });
}
