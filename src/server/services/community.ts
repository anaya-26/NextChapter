import "server-only";
import { Prisma, type GroupAudience, type GroupKind, type PostKind } from "@/generated/prisma/client";
import { allowedAudiences, isMinorBand } from "@/lib/age";
import { contactInfoReason, handleProblem, slugify } from "@/lib/community-safety";
import { needsWellbeingSupport } from "@/lib/wellbeing";
import { isHttpUrl } from "@/lib/utils";
import { prisma } from "../db";
import { getPrivacy, getProfile } from "./profile";
import { awardXp } from "./xp";

/**
 * The community is optional and pseudonymous: students join with a handle, see only spaces
 * meant for their age band, and share private things (achievements, goals, resources, their own
 * notes) only by deliberately posting an editable copy. Journals are never shareable.
 */

export type Audience = GroupAudience;

export class CommunityError extends Error {}

export async function communityAccess(userId: string, at: Date) {
  const [profile, cp] = await Promise.all([getProfile(userId), prisma.communityProfile.findUnique({ where: { userId } })]);
  const minor = isMinorBand(profile.ageBand);
  const needsConsent = minor && profile.guardianConsent !== "RECORDED";
  const suspendedUntil = cp?.suspendedUntil && cp.suspendedUntil > at ? cp.suspendedUntil : null;
  return {
    member: cp,
    audiences: allowedAudiences(profile.ageBand) as Audience[],
    ageBand: profile.ageBand,
    minor,
    needsConsent,
    suspendedUntil,
    canPost: !!cp && !needsConsent && !suspendedUntil,
    isModerator: !!cp?.isModerator,
  };
}

async function requireMember(userId: string, at: Date) {
  const a = await communityAccess(userId, at);
  if (a.needsConsent) throw new CommunityError("The community opens for students under 18 once a parent or guardian’s consent is recorded in Settings → Privacy.");
  if (!a.member) throw new CommunityError("Join the community first.");
  return a;
}

async function requirePoster(userId: string, at: Date) {
  const a = await requireMember(userId, at);
  if (a.suspendedUntil) throw new CommunityError(`Posting is paused until ${a.suspendedUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} after a moderation decision.`);
  return a;
}

function assertNoContactInfo(...texts: (string | null | undefined)[]) {
  const reason = contactInfoReason(texts.filter(Boolean).join("\n"));
  if (reason) throw new CommunityError(`To keep everyone safe, ${reason} can’t be shared in the community. Please remove them.`);
}

// ───────────────────────── membership ─────────────────────────

export async function joinCommunity(userId: string, input: { handle: string; bio: string | null }, at: Date) {
  const a = await communityAccess(userId, at);
  if (a.needsConsent) throw new CommunityError("Ask a parent or guardian to record consent in Settings → Privacy first.");
  if (a.member) return a.member;
  const problem = handleProblem(input.handle);
  if (problem) throw new CommunityError(problem);
  assertNoContactInfo(input.bio);
  try {
    return await prisma.communityProfile.create({ data: { userId, handle: input.handle, bio: input.bio } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new CommunityError("That handle is taken — try another.");
    throw e;
  }
}

export async function updateCommunityProfile(userId: string, input: { handle: string; bio: string | null }, at: Date) {
  await requireMember(userId, at);
  const problem = handleProblem(input.handle);
  if (problem) throw new CommunityError(problem);
  assertNoContactInfo(input.bio);
  try {
    return await prisma.communityProfile.update({ where: { userId }, data: { handle: input.handle, bio: input.bio } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new CommunityError("That handle is taken — try another.");
    throw e;
  }
}

/** Leaving deletes everything the student posted, their memberships and buddy links. */
export async function leaveCommunity(userId: string) {
  await prisma.$transaction([
    prisma.reaction.deleteMany({ where: { userId } }),
    prisma.comment.deleteMany({ where: { authorId: userId } }),
    prisma.post.deleteMany({ where: { authorId: userId } }),
    prisma.groupMember.deleteMany({ where: { userId } }),
    prisma.focusParticipant.deleteMany({ where: { userId } }),
    prisma.studyBuddyRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { recipientId: userId }] } }),
    prisma.communityProfile.deleteMany({ where: { userId } }),
    prisma.privacySettings.updateMany({ where: { userId }, data: { communityVisible: false } }),
  ]);
}

// ───────────────────────── groups ─────────────────────────

export const OFFICIAL_GROUPS: { slug: string; name: string; kind: GroupKind; audience: Audience; description: string }[] = [
  { slug: "class-10-boards", name: "Class 10 boards", kind: "EXAM", audience: "ALL_AGES", description: "CBSE, ICSE and state board Class 10 — questions, explanations and revision plans." },
  { slug: "class-12-science", name: "Class 11–12 Science", kind: "COURSE", audience: "ALL_AGES", description: "Physics, Chemistry, Biology and Maths for Classes 11 and 12, any board." },
  { slug: "jee-preparation", name: "JEE preparation", kind: "EXAM", audience: "ALL_AGES", description: "JEE Main and Advanced: concepts, problem-solving approaches and study plans. No paid-course promotion." },
  { slug: "neet-preparation", name: "NEET preparation", kind: "EXAM", audience: "ALL_AGES", description: "NEET UG: NCERT-first explanations, doubts and revision strategies." },
  { slug: "coding-beginners", name: "Coding for beginners", kind: "SUBJECT", audience: "ALL_AGES", description: "First programs, debugging help and small projects in any language." },
  { slug: "teen-study-circle", name: "Teen study circle (13–17)", kind: "GENERAL", audience: "TEENS", description: "A space for 13–17-year-olds to plan, stay accountable and swap study tips." },
  { slug: "first-year-college", name: "First year in college", kind: "GENERAL", audience: "ADULTS", description: "Settling in, semester exams, clubs and finding your way (18+)." },
  { slug: "upsc-state-psc", name: "UPSC & state PSC", kind: "EXAM", audience: "ADULTS", description: "Civil services preparation: answer writing, current affairs and NCERT basics (18+)." },
  { slug: "internships-careers", name: "Internships & careers", kind: "CAREER", audience: "ADULTS", description: "Applications, CVs, interviews and showcases of real projects (18+)." },
];

let groupsReady: Promise<void> | null = null;

export function ensureOfficialGroups() {
  groupsReady ??= (async () => {
    for (const g of OFFICIAL_GROUPS) {
      const data = { name: g.name, kind: g.kind, audience: g.audience, description: g.description, isOfficial: true, rules: g.audience === "ALL_AGES" ? "Strictly moderated: open to every age, so keep everything school-appropriate." : null };
      await prisma.group.upsert({ where: { slug: g.slug }, create: { slug: g.slug, ...data }, update: data });
    }
  })().catch((e) => {
    groupsReady = null;
    throw e;
  });
  return groupsReady;
}

export async function listGroups(userId: string, at: Date) {
  await ensureOfficialGroups();
  const a = await communityAccess(userId, at);
  const groups = await prisma.group.findMany({
    where: { audience: { in: a.audiences } },
    include: { _count: { select: { members: true, posts: { where: { status: "VISIBLE" } } } }, members: { where: { userId }, select: { role: true } } },
    orderBy: [{ isOfficial: "desc" }, { name: "asc" }],
  });
  return groups.map((g) => ({ ...g, myRole: g.members[0]?.role ?? null }));
}

export async function getGroup(userId: string, slug: string, at: Date) {
  await ensureOfficialGroups();
  const a = await communityAccess(userId, at);
  const g = await prisma.group.findFirst({ where: { slug, audience: { in: a.audiences } }, include: { _count: { select: { members: true } }, members: { where: { userId }, select: { role: true } } } });
  return g ? { ...g, myRole: g.members[0]?.role ?? null } : null;
}

async function visibleGroup(userId: string, groupId: string, at: Date) {
  const a = await communityAccess(userId, at);
  const g = await prisma.group.findFirst({ where: { id: groupId, audience: { in: a.audiences } } });
  if (!g) throw new CommunityError("Group not found");
  return g;
}

export async function joinGroup(userId: string, groupId: string, at: Date) {
  await requireMember(userId, at);
  await visibleGroup(userId, groupId, at);
  await prisma.groupMember.upsert({ where: { groupId_userId: { groupId, userId } }, create: { groupId, userId }, update: {} });
}

export async function leaveGroup(userId: string, groupId: string) {
  await prisma.groupMember.deleteMany({ where: { groupId, userId } });
}

/** Students create groups only for their own bracket; all-ages spaces are official and moderated. */
export async function createGroup(userId: string, input: { name: string; description: string; kind: GroupKind }, at: Date) {
  const a = await requirePoster(userId, at);
  const audience: Audience | null = a.ageBand === "ADULT" ? "ADULTS" : a.ageBand === "TEEN_13_15" || a.ageBand === "TEEN_16_17" ? "TEENS" : null;
  if (!audience) throw new CommunityError("Creating groups needs your age band in Settings (and isn’t available under 13). You can join the official groups.");
  assertNoContactInfo(input.name, input.description);
  const base = slugify(input.name);
  let slug = base;
  for (let i = 2; await prisma.group.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return prisma.group.create({ data: { slug, name: input.name, description: input.description, kind: input.kind, audience, createdById: userId, members: { create: { userId, role: "OWNER" } } } });
}

// ───────────────────────── posts ─────────────────────────

export async function blockedIds(userId: string) {
  const rows = await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

const authorSelect = { select: { id: true, communityProfile: { select: { handle: true } } } } as const;

export const handleOf = (author: { communityProfile: { handle: string } | null }) => author.communityProfile?.handle ?? "former member";

export async function listPosts(userId: string, at: Date, opts: { groupId?: string; kind?: PostKind; take?: number } = {}) {
  const a = await communityAccess(userId, at);
  if (!a.member || a.needsConsent) return [];
  const blocked = await blockedIds(userId);
  const groupFilter: Prisma.PostWhereInput = opts.groupId ? { groupId: opts.groupId, group: { audience: { in: a.audiences } } } : { group: { audience: { in: a.audiences }, members: { some: { userId } } } };
  return prisma.post.findMany({
    where: { ...groupFilter, ...(opts.kind ? { kind: opts.kind } : {}), authorId: { notIn: blocked }, OR: [{ status: "VISIBLE" }, { authorId: userId, status: "PENDING_REVIEW" }] },
    include: { author: authorSelect, group: { select: { slug: true, name: true, audience: true } }, _count: { select: { comments: { where: { status: "VISIBLE" } } } }, reactions: { where: { userId }, select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 30,
  });
}

export async function getPost(userId: string, postId: string, at: Date) {
  const a = await communityAccess(userId, at);
  if (!a.member || a.needsConsent) return null;
  const blocked = await blockedIds(userId);
  const post = await prisma.post.findFirst({
    where: { id: postId, group: { audience: { in: a.audiences } }, authorId: { notIn: blocked }, OR: [{ status: "VISIBLE" }, { authorId: userId, status: "PENDING_REVIEW" }] },
    include: {
      author: authorSelect,
      group: { select: { id: true, slug: true, name: true, audience: true } },
      reactions: { where: { userId }, select: { id: true } },
      comments: {
        where: { authorId: { notIn: blocked }, OR: [{ status: "VISIBLE" }, { authorId: userId, status: "PENDING_REVIEW" }] },
        include: { author: authorSelect, reactions: { where: { userId }, select: { id: true } } },
        orderBy: [{ helpfulCount: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  return post;
}

export type PostInput = {
  groupId: string;
  kind: PostKind;
  title: string;
  body: string;
  resourceUrl: string | null;
  attribution: string | null;
  sharedFromType: "achievement" | "goal" | "resource" | "note" | null;
  sharedFromId: string | null;
};

async function assertSharedSource(userId: string, type: PostInput["sharedFromType"], id: string | null) {
  if (!type || !id) return;
  const ok =
    type === "achievement"
      ? await prisma.achievement.findFirst({ where: { id, userId, approved: true, isDemo: false } })
      : type === "goal"
        ? await prisma.goal.findFirst({ where: { id, userId, isDemo: false } })
        : type === "resource"
          ? await prisma.resource.findFirst({ where: { id, userId } })
          : await prisma.note.findFirst({ where: { id, userId } });
  if (!ok) throw new CommunityError("You can only share your own items.");
}

export async function createPost(userId: string, input: PostInput, at: Date) {
  await requirePoster(userId, at);
  const group = await visibleGroup(userId, input.groupId, at);
  const recent = await prisma.post.count({ where: { authorId: userId, createdAt: { gte: new Date(at.getTime() - 3600_000) } } });
  if (recent >= 8) throw new CommunityError("You’ve posted a lot in the last hour — please wait a little before posting again.");
  assertNoContactInfo(input.title, input.body, input.attribution);
  if (input.resourceUrl && !isHttpUrl(input.resourceUrl)) throw new CommunityError("Resource links must start with http:// or https://");
  if (input.kind === "RESOURCE" && !input.resourceUrl) throw new CommunityError("Add the link to the resource.");
  if ((input.kind === "RESOURCE" || input.kind === "EXPLANATION") && !input.attribution) throw new CommunityError("Say where this comes from — “My own words”, or the book, video or website.");
  await assertSharedSource(userId, input.sharedFromType, input.sharedFromId);
  await prisma.groupMember.upsert({ where: { groupId_userId: { groupId: group.id, userId } }, create: { groupId: group.id, userId }, update: {} });
  const distress = needsWellbeingSupport(input.title, input.body);
  const post = await prisma.post.create({
    data: {
      groupId: group.id,
      authorId: userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      resourceUrl: input.resourceUrl,
      attribution: input.attribution,
      sharedFromType: input.sharedFromType,
      sharedFromId: input.sharedFromId,
      status: distress ? "PENDING_REVIEW" : "VISIBLE",
      createdAt: at,
    },
  });
  if (distress) await holdForCare(userId, "POST", post.id);
  return { post, heldForCare: distress };
}

/** Possible distress: held for a moderator and answered with support, never silently published. */
async function holdForCare(userId: string, targetType: "POST" | "COMMENT", targetId: string) {
  await prisma.contentFlag.upsert({
    where: { reporterId_targetType_targetId_reason: { reporterId: userId, targetType, targetId, reason: "SELF_HARM" } },
    create: { reporterId: userId, targetType, targetId, reason: "SELF_HARM", details: "Held automatically: the text may show distress. Please reach out kindly and share support lines." },
    update: {},
  });
}

export async function deleteOwnPost(userId: string, postId: string) {
  await prisma.post.deleteMany({ where: { id: postId, authorId: userId } });
}

export async function commentOn(userId: string, postId: string, input: { body: string; isExplanation: boolean; attribution: string | null }, at: Date) {
  await requirePoster(userId, at);
  const post = await getPost(userId, postId, at);
  if (!post || post.status !== "VISIBLE") throw new CommunityError("Post not found");
  const recent = await prisma.comment.count({ where: { authorId: userId, createdAt: { gte: new Date(at.getTime() - 3600_000) } } });
  if (recent >= 30) throw new CommunityError("Please slow down a little before answering again.");
  assertNoContactInfo(input.body, input.attribution);
  if (input.isExplanation && !input.attribution) throw new CommunityError("Say where the explanation comes from — “My own words” is fine.");
  await prisma.groupMember.upsert({ where: { groupId_userId: { groupId: post.group.id, userId } }, create: { groupId: post.group.id, userId }, update: {} });
  const distress = needsWellbeingSupport(input.body);
  const comment = await prisma.comment.create({ data: { postId, authorId: userId, body: input.body, isExplanation: input.isExplanation, attribution: input.attribution, status: distress ? "PENDING_REVIEW" : "VISIBLE", createdAt: at } });
  if (distress) await holdForCare(userId, "COMMENT", comment.id);
  else if (post.author.id !== userId) {
    await prisma.notification.upsert({
      where: { userId_dedupeKey: { userId: post.author.id, dedupeKey: `comment:${comment.id}` } },
      create: { userId: post.author.id, kind: "COMMUNITY", title: `New ${input.isExplanation ? "explanation" : "reply"} on “${post.title.slice(0, 60)}”`, link: `/community/posts/${postId}`, dueAt: at, dedupeKey: `comment:${comment.id}` },
      update: {},
    });
  }
  return { comment, heldForCare: distress };
}

export async function deleteOwnComment(userId: string, commentId: string) {
  await prisma.comment.deleteMany({ where: { id: commentId, authorId: userId } });
}

/** Marking an explanation helpful awards its author PEER_HELP XP — once per explanation. */
export async function markHelpful(userId: string, target: { postId?: string; commentId?: string }, at: Date) {
  await requireMember(userId, at);
  const blocked = await blockedIds(userId);
  if (target.commentId) {
    const c = await prisma.comment.findFirst({ where: { id: target.commentId, status: "VISIBLE", authorId: { notIn: blocked } }, include: { post: { select: { id: true, title: true, groupId: true } } } });
    if (!c || !(await getPost(userId, c.post.id, at))) throw new CommunityError("Not found");
    if (c.authorId === userId) throw new CommunityError("You can’t mark your own answer helpful.");
    try {
      await prisma.$transaction([prisma.reaction.create({ data: { userId, commentId: c.id, type: "HELPFUL" } }), prisma.comment.update({ where: { id: c.id }, data: { helpfulCount: { increment: 1 } } })]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { awarded: false };
      throw e;
    }
    const xp = c.isExplanation ? await awardXp(c.authorId, { action: "PEER_HELP", dedupeKey: `peer-help:comment:${c.id}`, reason: `Your explanation on “${c.post.title.slice(0, 60)}” helped someone`, sourceType: "comment", sourceId: c.id, at }) : null;
    await prisma.notification.upsert({
      where: { userId_dedupeKey: { userId: c.authorId, dedupeKey: `helpful:${c.id}` } },
      create: { userId: c.authorId, kind: "COMMUNITY", title: "Someone found your answer helpful", link: `/community/posts/${c.post.id}`, dueAt: at, dedupeKey: `helpful:${c.id}` },
      update: {},
    });
    return { awarded: !!xp?.awarded };
  }
  const p = target.postId ? await getPost(userId, target.postId, at) : null;
  if (!p || p.status !== "VISIBLE") throw new CommunityError("Not found");
  if (p.author.id === userId) throw new CommunityError("You can’t mark your own post helpful.");
  try {
    await prisma.$transaction([prisma.reaction.create({ data: { userId, postId: p.id, type: "HELPFUL" } }), prisma.post.update({ where: { id: p.id }, data: { helpfulCount: { increment: 1 } } })]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { awarded: false };
    throw e;
  }
  const xp = p.kind === "EXPLANATION" ? await awardXp(p.author.id, { action: "PEER_HELP", dedupeKey: `peer-help:post:${p.id}`, reason: `Your explanation “${p.title.slice(0, 60)}” helped someone`, sourceType: "post", sourceId: p.id, at }) : null;
  return { awarded: !!xp?.awarded };
}

export async function unmarkHelpful(userId: string, target: { postId?: string; commentId?: string }) {
  if (target.commentId) {
    const r = await prisma.reaction.deleteMany({ where: { userId, commentId: target.commentId, type: "HELPFUL" } });
    if (r.count) await prisma.comment.update({ where: { id: target.commentId }, data: { helpfulCount: { decrement: 1 } } });
  } else if (target.postId) {
    const r = await prisma.reaction.deleteMany({ where: { userId, postId: target.postId, type: "HELPFUL" } });
    if (r.count) await prisma.post.update({ where: { id: target.postId }, data: { helpfulCount: { decrement: 1 } } });
  }
}

// ───────────────────────── deliberate sharing ─────────────────────────

export type ShareDraft = Pick<PostInput, "kind" | "title" | "body" | "resourceUrl" | "attribution" | "sharedFromType" | "sharedFromId"> & { label: string };

/** An editable copy of one private item. Nothing is posted until the student submits it. */
export async function shareDraft(userId: string, type: string, id: string): Promise<ShareDraft> {
  if (type === "achievement") {
    const a = await prisma.achievement.findFirst({ where: { id, userId } });
    if (!a) throw new CommunityError("Not found");
    if (!a.approved) throw new CommunityError("Approve this achievement in your portfolio before sharing it.");
    if (a.isDemo) throw new CommunityError("Demonstration data can’t be shared with other students.");
    return { label: "achievement", kind: "SHOWCASE", title: a.title, body: [a.description, a.outcomes, a.skillsDemonstrated.length ? `Skills: ${a.skillsDemonstrated.join(", ")}` : null].filter(Boolean).join("\n\n"), resourceUrl: a.evidenceLinks[0] ?? null, attribution: "My own work", sharedFromType: "achievement", sharedFromId: a.id };
  }
  if (type === "goal") {
    const g = await prisma.goal.findFirst({ where: { id, userId }, include: { milestones: { orderBy: { order: "asc" } } } });
    if (!g) throw new CommunityError("Not found");
    if (g.isDemo) throw new CommunityError("Demonstration data can’t be shared with other students.");
    return { label: "goal", kind: "GOAL", title: g.title, body: [g.whyItMatters, g.milestones.length ? `Steps:\n${g.milestones.map((m) => `- ${m.title}`).join("\n")}` : null].filter(Boolean).join("\n\n") || g.title, resourceUrl: null, attribution: null, sharedFromType: "goal", sharedFromId: g.id };
  }
  if (type === "resource") {
    const r = await prisma.resource.findFirst({ where: { id, userId } });
    if (!r) throw new CommunityError("Not found");
    return { label: "resource", kind: "RESOURCE", title: r.title, body: "", resourceUrl: r.url, attribution: r.provider ?? new URL(r.url).hostname, sharedFromType: "resource", sharedFromId: r.id };
  }
  if (type === "note") {
    const n = await prisma.note.findFirst({ where: { id, userId } });
    if (!n) throw new CommunityError("Not found");
    return { label: "note", kind: "EXPLANATION", title: n.title, body: n.content.slice(0, 6000), resourceUrl: null, attribution: n.origin === "STUDENT" ? "My own words" : "My notes — includes AI-generated text", sharedFromType: "note", sharedFromId: n.id };
  }
  throw new CommunityError("This can’t be shared");
}

// ───────────────────────── blocking ─────────────────────────

export async function blockByHandle(userId: string, handle: string, at: Date) {
  await requireMember(userId, at);
  const target = await prisma.communityProfile.findUnique({ where: { handle } });
  if (!target || target.userId === userId) throw new CommunityError("Member not found");
  await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: target.userId } }, create: { blockerId: userId, blockedId: target.userId }, update: {} });
  await prisma.studyBuddyRequest.updateMany({ where: { OR: [{ requesterId: userId, recipientId: target.userId }, { requesterId: target.userId, recipientId: userId }], status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED", respondedAt: at } });
}

export async function unblock(userId: string, handle: string) {
  const target = await prisma.communityProfile.findUnique({ where: { handle } });
  if (target) await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: target.userId } });
}

export async function listBlocked(userId: string) {
  const rows = await prisma.block.findMany({ where: { blockerId: userId }, include: { blocked: { select: { communityProfile: { select: { handle: true } } } } } });
  return rows.map((r) => r.blocked.communityProfile?.handle).filter((h): h is string => !!h);
}

export async function setDiscoverable(userId: string, on: boolean, at: Date) {
  await requireMember(userId, at);
  const privacy = await getPrivacy(userId);
  if (privacy.communityVisible === on) return;
  await prisma.privacySettings.update({ where: { userId }, data: { communityVisible: on } });
}
