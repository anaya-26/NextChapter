import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { zonedToUtc } from "@/lib/time";
import { recordGuardianConsent, updatePrivacy, updateProfile } from "@/server/services/profile";
import { createAchievement, approveAchievement } from "@/server/services/portfolio";
import {
  blockByHandle,
  commentOn,
  communityAccess,
  createPost,
  ensureOfficialGroups,
  getPost,
  joinCommunity,
  joinGroup,
  leaveCommunity,
  listGroups,
  listPosts,
  markHelpful,
  setDiscoverable,
  shareDraft,
  type PostInput,
} from "@/server/services/community";
import { moderate, moderationQueue, report, setModerator } from "@/server/services/moderation";
import { buddySuggestions, listBuddies, requestBuddy, respondBuddy } from "@/server/services/buddies";
import { createRoom, getRoom, joinRoom, listRooms } from "@/server/services/focus-rooms";
import { createTestUser } from "../helpers/db";

const AT = zonedToUtc("2026-10-17", "18:00", "Asia/Kolkata");
let n = 0;

async function member(ageBand: "ADULT" | "TEEN_16_17" | "UNDER_13" | "UNDISCLOSED" = "ADULT", name = "Student") {
  const u = await createTestUser(name);
  await updateProfile(u.id, { ageBand });
  if (ageBand !== "ADULT" && ageBand !== "UNDISCLOSED") await recordGuardianConsent(u.id, AT);
  const handle = `${name.replace(/\W/g, "").slice(0, 10)}_${++n}`;
  await joinCommunity(u.id, { handle, bio: null }, AT);
  return { id: u.id, handle };
}

const groupId = async (slug: string) => (await prisma.group.findUniqueOrThrow({ where: { slug } })).id;
const post = (gid: string, over: Partial<PostInput> = {}): PostInput => ({ groupId: gid, kind: "QUESTION", title: "How do I balance redox equations?", body: "I keep getting the electrons wrong in acidic medium.", resourceUrl: null, attribution: null, sharedFromType: null, sharedFromId: null, ...over });

beforeAll(async () => {
  await ensureOfficialGroups();
});

describe("joining and age-appropriate spaces", () => {
  it("needs guardian consent for under-18s and keeps handles pseudonymous", async () => {
    const teen = await createTestUser("Teen");
    await updateProfile(teen.id, { ageBand: "TEEN_13_15" });
    await expect(joinCommunity(teen.id, { handle: "teen_learner", bio: null }, AT)).rejects.toThrow(/guardian/);
    await recordGuardianConsent(teen.id, AT);
    await joinCommunity(teen.id, { handle: "teen_learner", bio: null }, AT);
    const other = await createTestUser("Other");
    await expect(joinCommunity(other.id, { handle: "teen_learner", bio: null }, AT)).rejects.toThrow(/taken/);
    await expect(joinCommunity(other.id, { handle: "ok_handle", bio: "WhatsApp me on 9876543210" }, AT)).rejects.toThrow(/phone numbers|messaging/);
  });

  it("shows each student only the spaces for their age band", async () => {
    const teen = await member("TEEN_16_17", "Teen");
    const adult = await member("ADULT", "Adult");
    const undisclosed = await member("UNDISCLOSED", "Unknown");
    const slugs = async (id: string) => (await listGroups(id, AT)).map((g) => g.audience);
    expect(new Set(await slugs(teen.id))).toEqual(new Set(["ALL_AGES", "TEENS"]));
    expect(new Set(await slugs(adult.id))).toEqual(new Set(["ALL_AGES", "ADULTS"]));
    expect(new Set(await slugs(undisclosed.id))).toEqual(new Set(["ALL_AGES"]));

    const careers = await groupId("internships-careers");
    const { post: p } = await createPost(adult.id, post(careers, { title: "CV review tips" }), AT);
    expect(await getPost(teen.id, p.id, AT)).toBeNull();
    await expect(joinGroup(teen.id, careers, AT)).rejects.toThrow(/not found/);
    await expect(createPost(teen.id, post(careers), AT)).rejects.toThrow(/not found/);
  });
});

describe("posting safely", () => {
  it("blocks contact details, requires attribution, and never exposes private identity", async () => {
    const a = await member("ADULT", "Asha Patil");
    const g = await groupId("jee-preparation");
    await expect(createPost(a.id, post(g, { body: "DM me at asha@gmail.com" }), AT)).rejects.toThrow(/email addresses/);
    await expect(createPost(a.id, post(g, { kind: "RESOURCE", resourceUrl: "https://example.org/notes", attribution: null }), AT)).rejects.toThrow(/where this comes from/);
    await expect(createPost(a.id, post(g, { kind: "RESOURCE", resourceUrl: "javascript:alert(1)", attribution: "x" }), AT)).rejects.toThrow(/http/);
    const { post: p } = await createPost(a.id, post(g), AT);
    const reader = await member("ADULT", "Reader");
    const seen = await getPost(reader.id, p.id, AT);
    expect(seen?.author.communityProfile?.handle).toBe(a.handle);
    const json = JSON.stringify(seen);
    expect(json).not.toContain("Asha Patil");
    expect(json).not.toContain("@example.test");
  });

  it("holds posts that show distress for a moderator instead of publishing them", async () => {
    const a = await member();
    const reader = await member();
    const g = await groupId("class-12-science");
    const { post: p, heldForCare } = await createPost(a.id, post(g, { title: "Exams", body: "I feel hopeless and want to end it all" }), AT);
    expect(heldForCare).toBe(true);
    expect(p.status).toBe("PENDING_REVIEW");
    expect(await getPost(reader.id, p.id, AT)).toBeNull();
    expect((await getPost(a.id, p.id, AT))?.status).toBe("PENDING_REVIEW");
    expect(await prisma.contentFlag.count({ where: { targetId: p.id, reason: "SELF_HARM" } })).toBe(1);
  });

  it("shares only approved items deliberately, and never journals", async () => {
    const a = await member();
    const draft = await createAchievement(a.id, { kind: "PROJECT", title: "Pendulum timer", organisation: null, role: null, startMonth: null, endMonth: null, description: "Built a phone-free pendulum timer for lab work.", outcomes: null, skills: ["Arduino"], subjects: [], evidenceLinks: [] }, [], AT);
    await expect(shareDraft(a.id, "achievement", draft.id)).rejects.toThrow(/Approve/);
    await approveAchievement(a.id, draft.id, AT);
    const share = await shareDraft(a.id, "achievement", draft.id);
    expect(share).toMatchObject({ kind: "SHOWCASE", title: "Pendulum timer", sharedFromType: "achievement", attribution: "My own work" });
    await expect(shareDraft(a.id, "journal", "anything")).rejects.toThrow(/can’t be shared/);
    const other = await member();
    await expect(shareDraft(other.id, "achievement", draft.id)).rejects.toThrow(/Not found/);
    await expect(createPost(other.id, { ...share, groupId: await groupId("coding-beginners") }, AT)).rejects.toThrow(/your own/);
    const { post: p } = await createPost(a.id, { ...share, groupId: await groupId("coding-beginners") }, AT);
    expect(p).toMatchObject({ sharedFromType: "achievement", sharedFromId: draft.id, status: "VISIBLE" });
    await prisma.achievement.update({ where: { id: draft.id }, data: { isDemo: true } });
    await expect(shareDraft(a.id, "achievement", draft.id)).rejects.toThrow(/Demonstration data/);
  });
});

describe("helping each other", () => {
  it("awards PEER_HELP once when an explanation is marked helpful", async () => {
    const asker = await member();
    const helper = await member();
    const third = await member();
    const g = await groupId("neet-preparation");
    const { post: q } = await createPost(asker.id, post(g), AT);
    await expect(commentOn(helper.id, q.id, { body: "Balance atoms, then charge with H+ and electrons.", isExplanation: true, attribution: null }, AT)).rejects.toThrow(/where the explanation comes from/);
    const { comment } = await commentOn(helper.id, q.id, { body: "Balance atoms other than O and H, then O with water, H with H+, charge with electrons.", isExplanation: true, attribution: "My own words" }, AT);
    expect(await prisma.notification.count({ where: { userId: asker.id, kind: "COMMUNITY" } })).toBe(1);
    await expect(markHelpful(helper.id, { commentId: comment.id }, AT)).rejects.toThrow(/own/);
    expect(await markHelpful(asker.id, { commentId: comment.id }, AT)).toEqual({ awarded: true });
    expect(await markHelpful(asker.id, { commentId: comment.id }, AT)).toEqual({ awarded: false });
    expect(await markHelpful(third.id, { commentId: comment.id }, AT)).toEqual({ awarded: false });
    expect(await prisma.xpEvent.count({ where: { userId: helper.id, action: "PEER_HELP" } })).toBe(1);
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).helpfulCount).toBe(2);
  });
});

describe("reports, moderation and blocking", () => {
  it("hides reported content, flags incorrect resources, and lets moderators decide", async () => {
    const author = await member();
    const r1 = await member();
    const r2 = await member();
    const mod = await member();
    await setModerator(mod.id, true);
    const g = await groupId("class-10-boards");
    const { post: res } = await createPost(author.id, post(g, { kind: "RESOURCE", title: "Trig formula sheet", resourceUrl: "https://example.org/trig", attribution: "My own summary" }), AT);
    await report(r1.id, { targetType: "RESOURCE", targetId: res.id, reason: "INCORRECT", details: "sin 2x formula is wrong" }, AT);
    await report(r2.id, { targetType: "RESOURCE", targetId: res.id, reason: "INCORRECT", details: null }, AT);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: res.id } })).toMatchObject({ incorrectFlagCount: 2, status: "VISIBLE" });
    expect((await report(r1.id, { targetType: "RESOURCE", targetId: res.id, reason: "INCORRECT", details: null }, AT)).duplicate).toBe(true);

    const { post: spam } = await createPost(author.id, post(g, { kind: "DISCUSSION", title: "Buy notes cheap", body: "Best coaching notes for sale" }), AT);
    await report(r1.id, { targetType: "POST", targetId: spam.id, reason: "SPAM", details: null }, AT);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: spam.id } })).status).toBe("VISIBLE");
    expect((await report(r2.id, { targetType: "POST", targetId: spam.id, reason: "SPAM", details: null }, AT)).hidden).toBe(true); // 2 reports hide in all-ages spaces

    await expect(moderationQueue(r1.id)).rejects.toThrow(/Moderators only/);
    const queue = await moderationQueue(mod.id);
    expect(queue.find((q) => q.targetId === spam.id)).toMatchObject({ count: 2, reasons: ["SPAM"] });
    await moderate(mod.id, { targetType: "POST", targetId: spam.id, action: "SUSPEND", note: "Selling material" }, AT);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: spam.id } })).status).toBe("REMOVED");
    expect((await communityAccess(author.id, AT)).suspendedUntil).not.toBeNull();
    await expect(createPost(author.id, post(g), AT)).rejects.toThrow(/paused/);
    expect(await prisma.contentFlag.count({ where: { targetId: spam.id, status: "OPEN" } })).toBe(0);
  });

  it("hides a post at once when someone may be in danger, and reaches out to its author", async () => {
    const author = await member();
    const worried = await member();
    const { post: p } = await createPost(author.id, post(await groupId("jee-preparation"), { title: "Tired", body: "Everything is too much lately" }), AT);
    expect((await report(worried.id, { targetType: "POST", targetId: p.id, reason: "SELF_HARM", details: null }, AT)).hidden).toBe(true);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: author.id, kind: "SYSTEM" } });
    expect(n.body).toMatch(/14416/);
  });

  it("blocking hides each other's posts both ways and ends buddy links", async () => {
    const a = await member();
    const b = await member();
    const g = await groupId("coding-beginners");
    await joinGroup(a.id, g, AT);
    await joinGroup(b.id, g, AT);
    const { post: pb } = await createPost(b.id, post(g, { title: "Python loops question" }), AT);
    const { post: pa } = await createPost(a.id, post(g, { title: "Recursion question" }), AT);
    await blockByHandle(a.id, b.handle, AT);
    expect(await getPost(a.id, pb.id, AT)).toBeNull();
    expect(await getPost(b.id, pa.id, AT)).toBeNull();
    expect((await listPosts(a.id, AT)).some((p) => p.id === pb.id)).toBe(false);
    await expect(commentOn(b.id, pa.id, { body: "hi", isExplanation: false, attribution: null }, AT)).rejects.toThrow(/not found/);
  });
});

describe("study buddies and focus rooms", () => {
  it("pairs only discoverable students of the same age bracket", async () => {
    const a = await member("ADULT", "A");
    const b = await member("ADULT", "B");
    const teen = await member("TEEN_16_17", "T");
    const g = await groupId("jee-preparation");
    for (const m of [a, b, teen]) await joinGroup(m.id, g, AT);
    expect(await buddySuggestions(a.id, AT)).toEqual([]);
    await setDiscoverable(b.id, true, AT);
    await setDiscoverable(teen.id, true, AT);
    const sugg = await buddySuggestions(a.id, AT);
    expect(sugg.map((s) => s.handle)).toEqual([b.handle]);
    await expect(requestBuddy(a.id, teen.handle, null, AT)).rejects.toThrow(/isn’t available/);
    await expect(requestBuddy(a.id, b.handle, "Call me on 9876543210", AT)).rejects.toThrow(/contact/);
    const req = await requestBuddy(a.id, b.handle, "Revise mechanics together on Sundays?", AT);
    await expect(respondBuddy(a.id, req.id, true, AT)).rejects.toThrow(/not found/);
    await respondBuddy(b.id, req.id, true, AT);
    expect((await listBuddies(a.id)).buddies.map((x) => x.handle)).toEqual([b.handle]);

    const kid = await member("UNDER_13", "Kid");
    await expect(requestBuddy(kid.id, b.handle, null, AT)).rejects.toThrow(/13 and over/);
  });

  it("shares presence in focus rooms within the right audience and starts a personal session", async () => {
    const host = await member("ADULT", "Host");
    const peer = await member("ADULT", "Peer");
    const teen = await member("TEEN_16_17", "Teen");
    const room = await createRoom(host.id, { title: "Evening deep work", startsAt: AT, durationMinutes: 50, groupId: null }, AT);
    expect(room.audience).toBe("ADULTS");
    expect(await getRoom(teen.id, room.id, AT)).toBeNull();
    expect((await listRooms(teen.id, AT)).some((r) => r.id === room.id)).toBe(false);
    const session = await joinRoom(peer.id, room.id, "Finish 20 organic chemistry questions", AT);
    expect(await prisma.studySession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ focusRoomId: room.id, status: "IN_PROGRESS", plannedMinutes: 50 });
    const view = await getRoom(host.id, room.id, new Date(AT.getTime() + 60_000));
    expect(view?.phase).toBe("LIVE");
    expect(view?.present).toEqual([{ handle: peer.handle, goal: "Finish 20 organic chemistry questions", me: false }]);
    const later = await getRoom(host.id, room.id, new Date(AT.getTime() + 10 * 60_000));
    expect(later?.present).toEqual([]); // no heartbeat for 10 minutes
  });

  it("leaving the community deletes what the student posted", async () => {
    const a = await member();
    const { post: p } = await createPost(a.id, post(await groupId("class-10-boards")), AT);
    await updatePrivacy(a.id, { communityVisible: true });
    await leaveCommunity(a.id);
    expect(await prisma.post.findUnique({ where: { id: p.id } })).toBeNull();
    expect((await communityAccess(a.id, AT)).member).toBeNull();
    expect((await prisma.privacySettings.findUniqueOrThrow({ where: { userId: a.id } })).communityVisible).toBe(false);
  });
});
