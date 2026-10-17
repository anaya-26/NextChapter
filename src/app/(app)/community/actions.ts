"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { fail, fieldErrorsFrom, formToObject, type ActionResult } from "@/lib/action";
import { commentSchema, communityJoinSchema, communityProfileSchema, groupCreateSchema, postSchema, reportSchema, roomSchema, buddyMessageSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import {
  CommunityError,
  blockByHandle,
  commentOn,
  createGroup,
  createPost,
  deleteOwnComment,
  deleteOwnPost,
  getPost,
  joinCommunity,
  joinGroup,
  leaveCommunity,
  leaveGroup,
  markHelpful,
  setDiscoverable,
  unblock,
  unmarkHelpful,
  updateCommunityProfile,
} from "@/server/services/community";
import { moderate, report, type ModAction } from "@/server/services/moderation";
import { createRoom, heartbeat, joinRoom, leaveRoom } from "@/server/services/focus-rooms";
import { endBuddy, requestBuddy, respondBuddy } from "@/server/services/buddies";

const msg = (e: unknown, fallback: string) => (e instanceof CommunityError || e instanceof Error ? e.message : fallback);

export async function joinCommunityAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = communityJoinSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the form.", fieldErrorsFrom(r.error));
  try {
    await joinCommunity(user.id, { handle: r.data.handle, bio: r.data.bio }, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t join"), { handle: msg(e, "") });
  }
  redirect("/community?welcome=1");
}

export async function updateCommunityProfileAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = communityProfileSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the form.", fieldErrorsFrom(r.error));
  try {
    await updateCommunityProfile(user.id, r.data, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t save"));
  }
  refresh();
  return { ok: true, message: "Profile saved" };
}

export async function setDiscoverableAction(on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await setDiscoverable(user.id, on === true, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t update"));
  }
  refresh();
  return { ok: true, message: on ? "Students in your groups can now find you as a study buddy" : "You’re hidden from study buddy suggestions" };
}

export async function leaveCommunityAction() {
  const user = await requireUser();
  await leaveCommunity(user.id);
  redirect("/community");
}

export async function joinGroupAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await joinGroup(user.id, groupId, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t join"));
  }
  refresh();
  return { ok: true, message: "Joined" };
}

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  await leaveGroup(user.id, groupId);
  refresh();
  return { ok: true, message: "Left the group" };
}

export async function createGroupAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = groupCreateSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the form.", fieldErrorsFrom(r.error));
  let slug: string;
  try {
    slug = (await createGroup(user.id, r.data, await now(user.id))).slug;
  } catch (e) {
    return fail(msg(e, "Couldn’t create the group"));
  }
  redirect(`/community/groups/${slug}`);
}

export async function createPostAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = postSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the post.", fieldErrorsFrom(r.error));
  let target: string;
  try {
    const { post, heldForCare } = await createPost(user.id, r.data, await now(user.id));
    target = `/community/posts/${post.id}${heldForCare ? "?held=1" : ""}`;
  } catch (e) {
    return fail(msg(e, "Couldn’t post"));
  }
  redirect(target);
}

export async function deletePostAction(postId: string) {
  const user = await requireUser();
  await deleteOwnPost(user.id, postId);
  redirect("/community");
}

export async function commentAction(postId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = commentSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check your reply.", fieldErrorsFrom(r.error));
  try {
    const { heldForCare } = await commentOn(user.id, postId, r.data, await now(user.id));
    refresh();
    return heldForCare
      ? { ok: true, message: "Your reply is waiting for a moderator. If things feel hard right now, Tele-MANAS (14416) is free and open all day." }
      : { ok: true, message: r.data.isExplanation ? "Explanation posted — thank you for helping" : "Reply posted" };
  } catch (e) {
    return fail(msg(e, "Couldn’t reply"));
  }
}

export async function deleteCommentAction(commentId: string) {
  const user = await requireUser();
  await deleteOwnComment(user.id, commentId);
  refresh();
}

export async function helpfulAction(target: { postId?: string; commentId?: string }, on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const t = { postId: typeof target.postId === "string" ? target.postId : undefined, commentId: typeof target.commentId === "string" ? target.commentId : undefined };
  try {
    if (on) await markHelpful(user.id, t, await now(user.id));
    else await unmarkHelpful(user.id, t);
  } catch (e) {
    return fail(msg(e, "Couldn’t update"));
  }
  refresh();
  return { ok: true };
}

export async function reportAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = reportSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please choose a reason.", fieldErrorsFrom(r.error));
  try {
    const res = await report(user.id, r.data, await now(user.id));
    refresh();
    if (res.duplicate) return { ok: true, message: "You’ve already reported this — moderators will look at it." };
    if (r.data.reason === "SELF_HARM") return { ok: true, message: "Thank you. It’s hidden and moderators will see it first. If someone is in immediate danger, call 112." };
    return { ok: true, message: res.hidden ? "Thanks — it’s hidden until a moderator reviews it." : r.data.reason === "INCORRECT" ? "Thanks — others will see it’s been flagged as possibly incorrect." : "Thanks — moderators will review it." };
  } catch (e) {
    return fail(msg(e, "Couldn’t report"));
  }
}

export async function blockAction(handle: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await blockByHandle(user.id, handle, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t block"));
  }
  refresh();
  return { ok: true, message: `Blocked ${handle}. You won’t see each other’s posts.` };
}

export async function unblockAction(handle: string): Promise<ActionResult> {
  const user = await requireUser();
  await unblock(user.id, handle);
  refresh();
  return { ok: true, message: `Unblocked ${handle}` };
}

export async function moderateAction(targetType: "POST" | "COMMENT" | "USER" | "RESOURCE", targetId: string, action: ModAction, note: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!["POST", "COMMENT", "USER", "RESOURCE"].includes(targetType) || !["REMOVE", "RESTORE", "DISMISS", "SUSPEND"].includes(action)) return fail("Invalid action");
  try {
    await moderate(user.id, { targetType, targetId, action, note: note ? String(note).slice(0, 300) : null }, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t apply"));
  }
  refresh();
  return { ok: true, message: "Decision recorded" };
}

export async function saveResourceFromPostAction(postId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await getPost(user.id, postId, await now(user.id));
  if (!p || p.kind !== "RESOURCE" || !p.resourceUrl) return fail("Resource not found");
  const exists = await prisma.resource.findFirst({ where: { userId: user.id, url: p.resourceUrl } });
  if (!exists) {
    await prisma.resource.create({
      data: { userId: user.id, title: p.title.slice(0, 200), url: p.resourceUrl, provider: p.attribution, relevance: `Shared in ${p.group.name} by ${p.author.communityProfile?.handle ?? "a member"}${p.incorrectFlagCount ? ` — flagged as possibly incorrect by ${p.incorrectFlagCount}` : ""}`, origin: "COMMUNITY", saved: true },
    });
  }
  return { ok: true, message: "Saved to your resources" };
}

export async function createRoomAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = roomSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the room.", fieldErrorsFrom(r.error));
  const at = await now(user.id);
  const profile = await getProfile(user.id);
  if (r.data.when === "later" && (!r.data.date || !r.data.time)) return fail("Choose a date and time.", { date: "Pick a date and time" });
  const startsAt = r.data.when === "now" ? at : zonedToUtc(r.data.date!, r.data.time!, profile.timezone);
  let id: string;
  try {
    id = (await createRoom(user.id, { title: r.data.title, startsAt, durationMinutes: r.data.durationMinutes, groupId: r.data.groupId }, at)).id;
  } catch (e) {
    return fail(msg(e, "Couldn’t create the room"));
  }
  redirect(`/community/rooms/${id}`);
}

export async function joinRoomAction(roomId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const goal = String(form.get("goal") ?? "").trim().slice(0, 140) || null;
  try {
    await joinRoom(user.id, roomId, goal, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t join"));
  }
  refresh();
  return { ok: true, message: "You’re in. Your focus session has started." };
}

export async function heartbeatAction(roomId: string) {
  const user = await requireUser();
  await heartbeat(user.id, roomId, await now(user.id));
}

export async function leaveRoomAction(roomId: string): Promise<ActionResult> {
  const user = await requireUser();
  await leaveRoom(user.id, roomId, await now(user.id));
  refresh();
  return { ok: true, message: "You left the room. Finish your session to log it." };
}

export async function requestBuddyAction(handle: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = buddyMessageSchema.safeParse(formToObject(form));
  if (!r.success) return fail("Please check the message.", fieldErrorsFrom(r.error));
  try {
    await requestBuddy(user.id, handle, r.data.message, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t send"));
  }
  refresh();
  return { ok: true, message: `Request sent to ${handle}` };
}

export async function respondBuddyAction(id: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await respondBuddy(user.id, id, accept === true, await now(user.id));
  } catch (e) {
    return fail(msg(e, "Couldn’t update"));
  }
  refresh();
  return { ok: true, message: accept ? "You’re study buddies now" : "Request declined" };
}

export async function endBuddyAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await endBuddy(user.id, id, await now(user.id));
  refresh();
  return { ok: true, message: "Done" };
}
