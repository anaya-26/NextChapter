"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Pause, Play, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  applyChangesAction,
  applyPlanAction,
  disconnectGoogleAction,
  finishSessionAction,
  logStudyAction,
  missSessionAction,
  rejectChangeAction,
  resolveConflictAction,
  resolveObstacleAction,
  syncNowAction,
  updateSyncKindsAction,
} from "@/app/(app)/calendar/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { PlanOptions } from "@/server/services/planner";
import { KIND_META } from "./kinds";

function toastResult(r: { ok: boolean; message?: string }) {
  if (r.message) (r.ok ? toast.success : toast.error)(r.message);
}

/* ── Planner ──────────────────────────────────────────────────────── */

export function ApplyPlanButton({ options, replace, count }: { options: PlanOptions; replace: boolean; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || count === 0}
      onClick={() =>
        start(async () => {
          const r = await applyPlanAction(options, replace);
          toastResult(r);
          if (r.ok) router.push("/calendar");
        })
      }
    >
      <CalendarPlus /> {replace ? `Replace my plan with these ${count} sessions` : `Add ${count} sessions to my calendar`}
    </Button>
  );
}

/* ── Study sessions ───────────────────────────────────────────────── */

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Focus timer. Pausing only affects the count shown here; the student confirms actual minutes when finishing. */
export function FocusTimer({ elapsedAtRender, plannedMinutes }: { elapsedAtRender: number; plannedMinutes: number | null }) {
  const [elapsed, setElapsed] = useState(elapsedAtRender);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => {
    const el = document.getElementById("actualMinutes") as HTMLInputElement | null;
    if (el && !el.dataset.touched) el.value = String(Math.max(1, Math.round(elapsed / 60)));
  }, [elapsed]);
  const target = (plannedMinutes ?? 0) * 60;
  const pct = target ? Math.min(100, (elapsed / target) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--surface-2) 0deg)` }}>
        <div className="grid size-36 place-items-center rounded-full bg-surface">
          <span className="font-mono text-3xl tabular-nums" role="timer" aria-live="off">
            {mmss(elapsed)}
          </span>
        </div>
      </div>
      {target ? <p className="text-sm text-muted">{elapsed >= target ? "Planned time reached — take a short break, or keep going if you’re in the flow." : `Planned: ${plannedMinutes} minutes`}</p> : null}
      <Button size="sm" variant="ghost" onClick={() => setPaused(!paused)}>
        {paused ? <Play /> : <Pause />} {paused ? "Resume timer" : "Pause timer"}
      </Button>
    </div>
  );
}

export function FinishSessionForm({ sessionId, hasTopic, defaultMinutes }: { sessionId: string; hasTopic: boolean; defaultMinutes: number }) {
  return (
    <ActionForm action={finishSessionAction.bind(null, sessionId)} className="flex flex-col gap-3">
      <Field label="Minutes you actually studied" htmlFor="actualMinutes" hint="Honest numbers make your plans fit better — Kadam learns your pace from them.">
        <Input
          id="actualMinutes"
          name="actualMinutes"
          type="number"
          min={0}
          max={600}
          defaultValue={defaultMinutes}
          className="w-32"
          onChange={(e) => {
            e.currentTarget.dataset.touched = "1";
          }}
        />
        <FieldError name="actualMinutes" />
      </Field>
      <Field label="What went well? (optional)" htmlFor="achievements">
        <Textarea id="achievements" name="achievements" className="min-h-16" placeholder="e.g. Finally understood why V–I is a straight line" />
      </Field>
      <Field label="What was difficult? (optional)" htmlFor="difficulties">
        <Textarea id="difficulties" name="difficulties" className="min-h-16" placeholder="e.g. Kept mixing up series and parallel" />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Energy (optional)</legend>
        <div className="flex flex-wrap gap-1.5">
          {[
            [1, "Drained"],
            [2, "Low"],
            [3, "OK"],
            [4, "Good"],
            [5, "Great"],
          ].map(([v, label]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="energy" value={v} className="peer sr-only" />
              <span className="inline-flex h-8 items-center rounded-full border border-border-strong px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {hasTopic ? <Checkbox name="topicDone" label="I’ve finished studying this topic (schedules a first revision)" /> : null}
      <SubmitButton className="self-start">Save session</SubmitButton>
    </ActionForm>
  );
}

const MISS_REASONS = ["Too tired", "Class or coaching ran late", "Travel", "Distracted", "Family", "Felt too hard to start", "Plan changed"];

export function MissSessionForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">No problem — what got in the way? (optional, helps the plan adapt)</p>
      <div className="flex flex-wrap gap-1.5">
        {MISS_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(reason === r ? null : r)} aria-pressed={reason === r} className={cn("rounded-full border px-3 py-1 text-sm", reason === r ? "border-primary bg-primary-soft" : "border-border-strong")}>
            {r}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await missSessionAction(sessionId, reason);
            toast.success(r.pattern ? `Noted. ${r.pattern[0].toUpperCase()}${r.pattern.slice(1)} sessions have been hard lately — see Today for a quick adjustment.` : "Noted. Tomorrow is a new chance.");
            router.push("/today");
          })
        }
      >
        Mark as not done
      </Button>
    </div>
  );
}

export function LogStudyForm({ todayKey, nowTime, topics }: { todayKey: string; nowTime: string; topics: { id: string; label: string }[] }) {
  return (
    <ActionForm action={logStudyAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="What did you study?" htmlFor="log-title" className="sm:col-span-2">
        <Input id="log-title" name="title" placeholder="e.g. Solved 10 numericals on capacitors" maxLength={160} />
        <FieldError name="title" />
      </Field>
      {topics.length ? (
        <Field label="Topic (optional)" htmlFor="log-topic" className="sm:col-span-2">
          <Select id="log-topic" name="topicId" defaultValue="">
            <option value="">—</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Minutes" htmlFor="log-min">
        <Input id="log-min" name="minutes" type="number" min={5} max={600} step={5} defaultValue={30} />
        <FieldError name="minutes" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date" htmlFor="log-date">
          <Input id="log-date" name="date" type="date" defaultValue={todayKey} max={todayKey} />
        </Field>
        <Field label="Started" htmlFor="log-time">
          <Input id="log-time" name="time" type="time" defaultValue={nowTime} />
        </Field>
      </div>
      <SubmitButton size="sm" className="self-start">
        Log it
      </SubmitButton>
    </ActionForm>
  );
}

export function ObstacleForm({ actionId, part, reasons, parts }: { actionId: string; part: string; reasons: readonly string[]; parts: { id: string; label: string }[] }) {
  const [adjustment, setAdjustment] = useState<"MOVE" | "SHORTEN" | "KEEP">("MOVE");
  return (
    <ActionForm action={resolveObstacleAction.bind(null, actionId)} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">What usually gets in the way?</legend>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <label key={r} className="cursor-pointer">
              <input type="radio" name="reason" value={r} required className="peer sr-only" />
              <span className="inline-flex rounded-full border border-border-strong px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">{r}</span>
            </label>
          ))}
        </div>
        <FieldError name="reason" />
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">What should change?</legend>
        {[
          ["MOVE", "Move these sessions to a better time of day"],
          ["SHORTEN", "Keep the time, but make sessions shorter (25 min)"],
          ["KEEP", "Keep it — it was a rough patch"],
        ].map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="adjustment" value={v} checked={adjustment === v} onChange={() => setAdjustment(v as typeof adjustment)} className="accent-[var(--primary)]" />
            {label}
          </label>
        ))}
      </fieldset>
      {adjustment === "MOVE" ? (
        <Field label="Better time" htmlFor={`move-${actionId}`}>
          <Select id={`move-${actionId}`} name="moveTo" defaultValue={parts.find((p) => p.id !== part)?.id}>
            {parts
              .filter((p) => p.id !== part)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label[0].toUpperCase() + p.label.slice(1)}
                </option>
              ))}
          </Select>
          <FieldError name="moveTo" />
        </Field>
      ) : null}
      <Field label="Anything else? (optional)" htmlFor={`note-${actionId}`}>
        <Input id={`note-${actionId}`} name="note" maxLength={300} />
      </Field>
      <p className="text-xs text-muted">Your answer is saved to what Kadam remembers (you can edit or delete it in Settings → Memory).</p>
      <SubmitButton size="sm" className="self-start">
        Adjust my plan
      </SubmitButton>
    </ActionForm>
  );
}

/* ── Google Calendar sync ─────────────────────────────────────────── */

export function SyncNowButton() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => toastResult(await syncNowAction()))}>
      <RefreshCw className={pending ? "animate-spin" : undefined} /> Check Google now
    </Button>
  );
}

export function ApproveButton({ ids, label }: { ids: string[] | "all"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => toastResult(await applyChangesAction(ids)))}>
      <Check /> {label}
    </Button>
  );
}

export function RejectButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => rejectChangeAction(id))}>
      <X /> Don’t
    </Button>
  );
}

export function ConflictButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => toastResult(await resolveConflictAction(id, "kadam")))}>
        Keep Kadam’s version
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => toastResult(await resolveConflictAction(id, "google")))}>
        Keep Google’s version
      </Button>
    </div>
  );
}

export function SyncKindsForm({ selected, kinds }: { selected: string[]; kinds: readonly string[] }) {
  return (
    <ActionForm action={updateSyncKindsAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="checkbox" name="kinds" value={k} defaultChecked={selected.includes(k)} className="peer sr-only" />
            <span className="inline-flex rounded-full border border-border-strong px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">{KIND_META[k]?.label ?? k}</span>
          </label>
        ))}
      </div>
      <SubmitButton size="sm" variant="outline" className="self-start">
        Save
      </SubmitButton>
    </ActionForm>
  );
}

export function DisconnectForm() {
  const [deleteCalendar, setDeleteCalendar] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Checkbox label="Also delete the “Kadam — study plan” calendar from my Google account" checked={deleteCalendar} onChange={(e) => setDeleteCalendar(e.target.checked)} />
      <Button
        size="sm"
        variant="outline"
        className="self-start text-danger"
        disabled={pending}
        onClick={() => {
          if (confirm("Disconnect Google Calendar? Kadam will stop syncing and forget its access.")) start(() => disconnectGoogleAction(deleteCalendar));
        }}
      >
        Disconnect Google Calendar
      </Button>
    </div>
  );
}
