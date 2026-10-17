"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Bookmark, Flag, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  blockAction,
  commentAction,
  createGroupAction,
  createPostAction,
  createRoomAction,
  deleteCommentAction,
  deletePostAction,
  endBuddyAction,
  heartbeatAction,
  helpfulAction,
  joinCommunityAction,
  joinGroupAction,
  joinRoomAction,
  leaveCommunityAction,
  leaveGroupAction,
  leaveRoomAction,
  moderateAction,
  reportAction,
  requestBuddyAction,
  respondBuddyAction,
  saveResourceFromPostAction,
  setDiscoverableAction,
  unblockAction,
  updateCommunityProfileAction,
} from "@/app/(app)/community/actions";
import { ActionForm, FieldError, FormMessage } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, SubmitButton, Switch, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { POST_KINDS } from "./post-list";

type Result = { ok: boolean; message?: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result | void>) =>
    start(async () => {
      const r = await fn();
      if (r?.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  return { pending, run };
}

export function JoinForm({ guidelines, rules }: { guidelines: string[]; rules: string }) {
  return (
    <ActionForm action={joinCommunityAction} className="flex flex-col gap-4">
      <FormMessage />
      <Field label="Choose a handle" htmlFor="c-handle" hint={rules}>
        <Input id="c-handle" name="handle" required minLength={3} maxLength={20} autoComplete="off" placeholder="e.g. orbit_learner" />
        <FieldError name="handle" />
      </Field>
      <Field label="A line about you (optional)" htmlFor="c-bio" hint="What you’re studying or working towards. No contact details.">
        <Textarea id="c-bio" name="bio" maxLength={280} className="min-h-16" />
      </Field>
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <p className="mb-1 font-medium">Community guidelines</p>
        <ul className="list-disc pl-5 text-muted">
          {guidelines.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      <Checkbox name="agree" label="I’ll follow these guidelines" required />
      <FieldError name="agree" />
      <SubmitButton className="self-start">Join the community</SubmitButton>
    </ActionForm>
  );
}

export function ProfileForm({ handle, bio, rules }: { handle: string; bio: string; rules: string }) {
  return (
    <ActionForm action={updateCommunityProfileAction} className="flex flex-col gap-3">
      <Field label="Handle" htmlFor="p-handle" hint={rules}>
        <Input id="p-handle" name="handle" defaultValue={handle} required />
      </Field>
      <Field label="About you" htmlFor="p-bio">
        <Textarea id="p-bio" name="bio" defaultValue={bio} maxLength={280} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" className="self-start">
        Save
      </SubmitButton>
    </ActionForm>
  );
}

export function DiscoverableSwitch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-start gap-3 text-sm">
      <Switch checked={on} disabled={pending || disabled} onCheckedChange={(v) => run(() => setDiscoverableAction(v))} aria-label="Let students in my groups find me as a study buddy" />
      <span>
        <span className="font-medium">Let students in my groups find me as a study buddy</span>
        <span className="block text-muted">Shows your handle and shared groups to students of your age bracket. Nothing from your private profile.</span>
      </span>
    </label>
  );
}

export function LeaveCommunityButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Leave the community? Everything you posted, your groups and study buddies will be deleted. Your private work isn’t affected.")) start(() => leaveCommunityAction());
      }}
    >
      Leave and delete my posts
    </Button>
  );
}

export function GroupMembershipButton({ groupId, member }: { groupId: string; member: boolean }) {
  const { pending, run } = useRun();
  return member ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => leaveGroupAction(groupId))}>
      Leave group
    </Button>
  ) : (
    <Button size="sm" disabled={pending} onClick={() => run(() => joinGroupAction(groupId))}>
      Join
    </Button>
  );
}

export function CreateGroupButton({ audienceNote }: { audienceNote: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> New group
      </Button>
      {open ? (
        <DialogContent title="Start a group" description={audienceNote}>
          <ActionForm action={createGroupAction} className="flex flex-col gap-3">
            <FormMessage />
            <Field label="Name" htmlFor="g-name">
              <Input id="g-name" name="name" required maxLength={80} />
              <FieldError name="name" />
            </Field>
            <Field label="What it’s for" htmlFor="g-desc">
              <Textarea id="g-desc" name="description" required maxLength={400} className="min-h-20" />
              <FieldError name="description" />
            </Field>
            <Field label="Kind" htmlFor="g-kind">
              <Select id="g-kind" name="kind" defaultValue="SUBJECT">
                <option value="SUBJECT">Subject</option>
                <option value="COURSE">Course</option>
                <option value="EXAM">Exam</option>
                <option value="PROJECT">Project</option>
                <option value="CAREER">Career</option>
                <option value="GENERAL">General</option>
              </Select>
            </Field>
            <SubmitButton className="self-start">Create group</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}


export function PostComposer({
  groups,
  defaultGroupId,
  draft,
  handle,
}: {
  groups: { id: string; name: string }[];
  defaultGroupId?: string;
  draft?: { kind: string; title: string; body: string; resourceUrl: string | null; attribution: string | null; sharedFromType: string | null; sharedFromId: string | null; label: string };
  handle: string;
}) {
  const [kind, setKind] = useState(draft?.kind ?? "QUESTION");
  const needsAttribution = kind === "RESOURCE" || kind === "EXPLANATION" || kind === "SHOWCASE";
  return (
    <ActionForm action={createPostAction} className="flex flex-col gap-3">
      <FormMessage />
      {draft ? <input type="hidden" name="sharedFromType" value={draft.sharedFromType ?? ""} /> : null}
      {draft?.sharedFromId ? <input type="hidden" name="sharedFromId" value={draft.sharedFromId} /> : null}
      <div className={cn("grid grid-cols-1 gap-3", groups.length > 1 && "sm:grid-cols-2")}>
        {groups.length > 1 ? (
          <Field label="Group" htmlFor="post-group">
            <Select id="post-group" name="groupId" defaultValue={defaultGroupId ?? groups[0]?.id} required>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <FieldError name="groupId" />
          </Field>
        ) : (
          <input type="hidden" name="groupId" value={groups[0]?.id ?? ""} />
        )}
        <Field label="Type" htmlFor="post-kind">
          <Select id="post-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {POST_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Title" htmlFor="post-title">
        <Input id="post-title" name="title" defaultValue={draft?.title} required maxLength={160} />
        <FieldError name="title" />
      </Field>
      <Field label={kind === "QUESTION" ? "Your question — what have you tried?" : "Details"} htmlFor="post-body">
        <Textarea id="post-body" name="body" defaultValue={draft?.body} required className="min-h-32" placeholder={kind === "RESOURCE" ? "Why it helped you, and for which topic" : undefined} />
        <FieldError name="body" />
      </Field>
      {kind === "RESOURCE" || draft?.resourceUrl ? (
        <Field label="Link" htmlFor="post-url">
          <Input id="post-url" name="resourceUrl" type="url" defaultValue={draft?.resourceUrl ?? ""} required={kind === "RESOURCE"} placeholder="https://…" />
        </Field>
      ) : null}
      {needsAttribution ? (
        <Field label="Where it comes from" htmlFor="post-attr" hint="“My own words”, “My own work”, or the book, video or website — so others can check it.">
          <Input id="post-attr" name="attribution" defaultValue={draft?.attribution ?? ""} required />
        </Field>
      ) : null}
      <p className="text-xs text-muted">
        Posted as <span className="font-medium">{handle}</span>. Only this text is shared — {draft ? `nothing else from your ${draft.label}` : "nothing from your private profile"}. You can delete it any time.
      </p>
      <SubmitButton className="self-start" pendingLabel="Posting…">
        Post
      </SubmitButton>
    </ActionForm>
  );
}

export function CommentForm({ postId, question }: { postId: string; question: boolean }) {
  const [explain, setExplain] = useState(question);
  return (
    <ActionForm action={commentAction.bind(null, postId)} className="flex flex-col gap-3">
      <Field label={explain ? "Your explanation" : "Your reply"} htmlFor={`c-${postId}`}>
        <Textarea id={`c-${postId}`} name="body" required className="min-h-24" />
        <FieldError name="body" />
      </Field>
      <Checkbox name="isExplanation" checked={explain} onChange={(e) => setExplain(e.target.checked)} label="This is an explanation (others can mark it helpful)" />
      {explain ? (
        <Field label="Where it comes from" htmlFor={`ca-${postId}`}>
          <Input id={`ca-${postId}`} name="attribution" defaultValue="My own words" required />
        </Field>
      ) : null}
      <SubmitButton size="sm" className="self-start">
        {explain ? "Post explanation" : "Reply"}
      </SubmitButton>
    </ActionForm>
  );
}

export function HelpfulButton({ target, marked, count, own }: { target: { postId?: string; commentId?: string }; marked: boolean; count: number; own: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant={marked ? "soft" : "ghost"} disabled={pending || own} aria-pressed={marked} onClick={() => run(() => helpfulAction(target, !marked))} title={own ? "Others can mark this helpful" : undefined}>
      <ThumbsUp /> Helpful{count ? ` · ${count}` : ""}
    </Button>
  );
}

export function ReportButton({ targetType, targetId, reasons, label = "Report" }: { targetType: "POST" | "COMMENT" | "USER" | "RESOURCE"; targetId: string; reasons: { value: string; label: string }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Flag /> {label}
      </Button>
      {open ? (
        <DialogContent title={targetType === "RESOURCE" ? "Flag this resource" : "Report"} description="Reports are private. Moderators review them; repeated reports hide content until then.">
          <ActionForm action={reportAction} onSuccess={() => setOpen(false)} className="flex flex-col gap-3">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">What’s wrong?</legend>
              {reasons.map((r, i) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="reason" value={r.value} defaultChecked={i === 0} className="accent-[var(--primary)]" /> {r.label}
                </label>
              ))}
            </fieldset>
            <Field label="Details (optional)" htmlFor="rep-details">
              <Textarea id="rep-details" name="details" maxLength={500} className="min-h-16" />
            </Field>
            <SubmitButton className="self-start">Send report</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function BlockButton({ handle }: { handle: string }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (confirm(`Block ${handle}? You won’t see each other’s posts or replies, and buddy links end.`)) run(() => blockAction(handle));
      }}
    >
      <Ban /> Block {handle}
    </Button>
  );
}

export function UnblockButton({ handle }: { handle: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unblockAction(handle))}>
      Unblock
    </Button>
  );
}

export function DeleteOwnButton({ postId, commentId }: { postId?: string; commentId?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this for everyone?")) return;
        start(() => (postId ? deletePostAction(postId) : deleteCommentAction(commentId!)));
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export function SaveResourceButton({ postId }: { postId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => saveResourceFromPostAction(postId))}>
      <Bookmark /> Save to my resources
    </Button>
  );
}

export function ModerationButtons({ targetType, targetId }: { targetType: "POST" | "COMMENT" | "USER" | "RESOURCE"; targetId: string }) {
  const { pending, run } = useRun();
  const [note, setNote] = useState("");
  const act = (action: "REMOVE" | "RESTORE" | "DISMISS" | "SUSPEND") => run(() => moderateAction(targetType, targetId, action, note || null));
  return (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`note-${targetId}`}>
        Note to the author
      </label>
      <Input id={`note-${targetId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the author (optional)" className="h-9 text-sm" />
      <div className="flex flex-wrap gap-2">
        {targetType !== "USER" ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act("RESTORE")}>
              Keep visible
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act("REMOVE")}>
              Remove
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act("DISMISS")}>
            Dismiss
          </Button>
        )}
        <Button size="sm" variant="outline" className="text-danger" disabled={pending} onClick={() => act("SUSPEND")}>
          Remove and pause posting 7 days
        </Button>
      </div>
    </div>
  );
}

export function CreateRoomButton({ groups, defaultGroupId, todayKey }: { groups: { id: string; name: string }[]; defaultGroupId?: string; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Start a focus room
      </Button>
      {open ? (
        <DialogContent title="Start a focus room" description="Presence only: others see your handle and goal and a shared timer. No chat or camera.">
          <ActionForm action={createRoomAction} className="flex flex-col gap-3">
            <FormMessage />
            <Field label="Room name" htmlFor="r-title">
              <Input id="r-title" name="title" required maxLength={80} placeholder="e.g. Sunday morning maths" />
            </Field>
            <fieldset className="flex gap-4 text-sm">
              <legend className="sr-only">When</legend>
              {(["now", "later"] as const).map((w) => (
                <label key={w} className="flex items-center gap-2">
                  <input type="radio" name="when" value={w} checked={when === w} onChange={() => setWhen(w)} className="accent-[var(--primary)]" /> {w === "now" ? "Start now" : "Schedule"}
                </label>
              ))}
            </fieldset>
            {when === "later" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" htmlFor="r-date">
                  <Input id="r-date" name="date" type="date" min={todayKey} required />
                  <FieldError name="date" />
                </Field>
                <Field label="Time" htmlFor="r-time">
                  <Input id="r-time" name="time" type="time" required />
                </Field>
              </div>
            ) : null}
            <Field label="Length" htmlFor="r-dur">
              <Select id="r-dur" name="durationMinutes" defaultValue="50">
                {[25, 50, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Group (optional)" htmlFor="r-group" hint="Rooms in a group are visible to that group’s audience; others to your age bracket.">
              <Select id="r-group" name="groupId" defaultValue={defaultGroupId ?? ""}>
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="self-start">Create room</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function JoinRoomForm({ roomId }: { roomId: string }) {
  return (
    <ActionForm action={joinRoomAction.bind(null, roomId)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Your goal for this session (shown to others)" htmlFor="room-goal" className="flex-1">
        <Input id="room-goal" name="goal" maxLength={140} placeholder="e.g. 15 integration problems" />
      </Field>
      <SubmitButton>Join and start focusing</SubmitButton>
    </ActionForm>
  );
}

/** Keeps your presence fresh while the room is open and refreshes who is here. */
export function RoomPresence({ roomId, active }: { roomId: string; active: boolean }) {
  const router = useRouter();
  const tick = useEffectEvent(async () => {
    if (active) await heartbeatAction(roomId);
    router.refresh();
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

export function LeaveRoomButton({ roomId }: { roomId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => leaveRoomAction(roomId))}>
      Leave room
    </Button>
  );
}

export function RoomTimer({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const [nowMs, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const id = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  if (nowMs === null) return <p className="text-3xl font-semibold tabular-nums">--:--</p>;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const before = nowMs < start;
  const ms = Math.max(0, before ? start - nowMs : end - nowMs);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <div>
      <p className="text-sm text-muted">{before ? "Starts in" : nowMs < end ? "Time left" : "Room ended"}</p>
      <p className={cn("text-4xl font-semibold tabular-nums", !before && nowMs < end && "text-primary")} role="timer" aria-live="off">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </p>
    </div>
  );
}

export function BuddyRequestButton({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ask to be buddies
      </Button>
      {open ? (
        <DialogContent title={`Study buddy request to ${handle}`} description="Buddies keep each other going. Keep it to study plans — no contact details.">
          <ActionForm action={requestBuddyAction.bind(null, handle)} onSuccess={() => setOpen(false)} className="flex flex-col gap-3">
            <Field label="Message (optional)" htmlFor="b-msg">
              <Textarea id="b-msg" name="message" maxLength={280} className="min-h-16" placeholder="e.g. Want to do a focus room on weekday evenings?" />
            </Field>
            <SubmitButton className="self-start">Send request</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function BuddyResponseButtons({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => respondBuddyAction(id, true))}>
        Accept
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => respondBuddyAction(id, false))}>
        Decline
      </Button>
    </div>
  );
}

export function EndBuddyButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => endBuddyAction(id))}>
      {label}
    </Button>
  );
}
