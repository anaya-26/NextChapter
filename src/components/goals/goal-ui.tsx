"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Circle, MoreHorizontal, Pause, Play, Star, Trash2, Trophy, X } from "lucide-react";
import { addMilestoneAction, goalStatusAction, makePriority, removeGoal, removeMilestone, saveGoal, toggleMilestoneAction } from "@/app/(app)/goals/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

export type GoalView = {
  id: string;
  title: string;
  description: string | null;
  whyItMatters: string | null;
  horizon: string;
  category: string;
  status: string;
  targetDate: string | null;
  isCurrentPriority: boolean;
  origin: string;
  isDemo: boolean;
  milestones: { id: string; title: string; dueAt: string | null; done: boolean }[];
};

const CATEGORIES = [
  ["ACADEMIC", "Academic"],
  ["EXAM", "Exam"],
  ["SKILL", "Skill"],
  ["CAREER", "Career"],
  ["PROJECT", "Project"],
  ["PERSONAL", "Personal"],
  ["WELLBEING", "Wellbeing"],
] as const;

function daysUntil(dateKey: string, todayIso: string) {
  return Math.round((new Date(`${dateKey}T00:00:00Z`).getTime() - new Date(todayIso.slice(0, 10) + "T00:00:00Z").getTime()) / 86400000);
}

export function GoalCard({ goal, today, highlight }: { goal: GoalView; today: string; timezone: string; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = goal.milestones.filter((m) => m.done).length;
  const left = goal.targetDate ? daysUntil(goal.targetDate, today) : null;

  if (editing) {
    return (
      <Card className="p-5">
        <GoalForm initial={goal} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col gap-3 p-5", highlight && "border-primary/50 bg-primary-soft/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={goal.horizon === "SHORT" ? "primary" : "info"}>{goal.horizon === "SHORT" ? "Short-term" : "Long-term"}</Badge>
            <Badge>{CATEGORIES.find(([v]) => v === goal.category)?.[1]}</Badge>
            {goal.status === "ACHIEVED" ? (
              <Badge tone="success">
                <Trophy /> Achieved
              </Badge>
            ) : null}
            {goal.status === "PAUSED" ? <Badge tone="warning">Paused</Badge> : null}
            {goal.status === "DROPPED" ? <Badge>Set aside</Badge> : null}
            {goal.origin === "GAP_ANALYSIS" ? <Badge tone="accent">From an opportunity gap</Badge> : null}
            {goal.isDemo ? <DemoBadge /> : null}
          </div>
          <h3 className={cn("font-semibold", highlight && "text-lg")}>{goal.title}</h3>
          {goal.description ? <p className="mt-1 text-sm text-muted">{goal.description}</p> : null}
          {goal.whyItMatters ? <p className="mt-1 text-sm italic text-muted">Why: {goal.whyItMatters}</p> : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${goal.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!goal.isCurrentPriority && goal.status === "ACTIVE" ? (
              <DropdownMenuItem onSelect={() => startTransition(() => makePriority(goal.id))}>
                <Star /> Make current priority
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
            {goal.status !== "ACHIEVED" ? (
              <DropdownMenuItem onSelect={() => startTransition(() => goalStatusAction(goal.id, "ACHIEVED"))}>
                <Trophy /> Mark achieved
              </DropdownMenuItem>
            ) : null}
            {goal.status === "ACTIVE" ? (
              <DropdownMenuItem onSelect={() => startTransition(() => goalStatusAction(goal.id, "PAUSED"))}>
                <Pause /> Pause
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => startTransition(() => goalStatusAction(goal.id, "ACTIVE"))}>
                <Play /> Make active
              </DropdownMenuItem>
            )}
            {goal.status !== "DROPPED" ? (
              <DropdownMenuItem onSelect={() => startTransition(() => goalStatusAction(goal.id, "DROPPED"))}>
                <X /> Set aside
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={() => startTransition(() => removeGoal(goal.id))}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {goal.targetDate ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="size-4" aria-hidden />
          Target {goal.targetDate}
          {left !== null && goal.status === "ACTIVE" ? (
            <span className={cn("font-medium", left < 0 ? "text-danger" : left <= 7 ? "text-warning" : "text-fg")}>
              · {left < 0 ? `${-left} days past` : left === 0 ? "today" : `${left} days left`}
            </span>
          ) : null}
        </p>
      ) : null}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">
          Milestones {goal.milestones.length ? `· ${done}/${goal.milestones.length}` : ""}
        </p>
        <ul className="flex flex-col gap-1">
          {goal.milestones.map((m) => (
            <li key={m.id} className="group flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => toggleMilestoneAction(m.id))}
                aria-label={m.done ? `Mark ${m.title} not done` : `Mark ${m.title} done`}
                className="cursor-pointer text-primary"
              >
                {m.done ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5 text-muted" aria-hidden />}
              </button>
              <span className={cn("flex-1", m.done && "text-muted line-through")}>{m.title}</span>
              {m.dueAt ? <span className="text-xs text-muted">{m.dueAt}</span> : null}
              <button
                type="button"
                onClick={() => startTransition(() => removeMilestone(m.id))}
                aria-label={`Delete milestone ${m.title}`}
                className="cursor-pointer rounded p-0.5 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {goal.status === "ACTIVE" ? (
          <ActionForm action={addMilestoneAction} resetOnSuccess silent className="mt-2 flex gap-2">
            <input type="hidden" name="goalId" value={goal.id} />
            <Input name="title" placeholder="Add a milestone" aria-label="New milestone" className="h-8" maxLength={160} />
            <Input name="dueAt" type="date" aria-label="Milestone due date" className="h-8 w-36" />
            <SubmitButton size="sm" variant="secondary">
              Add
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </Card>
  );
}

export function GoalForm({ initial, onDone }: { initial?: GoalView; onDone?: () => void }) {
  return (
    <ActionForm action={saveGoal.bind(null, initial?.id ?? null)} resetOnSuccess={!initial} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2">
      <Field label="Goal" htmlFor={`g-title-${initial?.id ?? "new"}`} className="sm:col-span-2">
        <Input id={`g-title-${initial?.id ?? "new"}`} name="title" defaultValue={initial?.title} placeholder="Specific and achievable" required maxLength={160} />
        <FieldError name="title" />
      </Field>
      <Field label="Timeframe" htmlFor={`g-h-${initial?.id ?? "new"}`}>
        <Select id={`g-h-${initial?.id ?? "new"}`} name="horizon" defaultValue={initial?.horizon ?? "SHORT"}>
          <option value="SHORT">Short-term (weeks)</option>
          <option value="LONG">Long-term (months or years)</option>
        </Select>
      </Field>
      <Field label="Category" htmlFor={`g-c-${initial?.id ?? "new"}`}>
        <Select id={`g-c-${initial?.id ?? "new"}`} name="category" defaultValue={initial?.category ?? "ACADEMIC"}>
          {CATEGORIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Target date (optional)" htmlFor={`g-d-${initial?.id ?? "new"}`}>
        <Input id={`g-d-${initial?.id ?? "new"}`} name="targetDate" type="date" defaultValue={initial?.targetDate ?? ""} />
      </Field>
      <div className="flex items-end">
        <Checkbox name="isCurrentPriority" label="Make this my current priority" defaultChecked={initial?.isCurrentPriority} />
      </div>
      <Field label="Why it matters to you (optional)" htmlFor={`g-w-${initial?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`g-w-${initial?.id ?? "new"}`} name="whyItMatters" defaultValue={initial?.whyItMatters ?? ""} className="min-h-16" maxLength={600} />
      </Field>
      <input type="hidden" name="description" value={initial?.description ?? ""} />
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm">{initial ? "Save goal" : "Add goal"}</SubmitButton>
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}
