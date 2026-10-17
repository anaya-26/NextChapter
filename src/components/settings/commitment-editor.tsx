"use client";

import { useState, useTransition } from "react";
import { Clock, Pencil, Trash2 } from "lucide-react";
import { COMMITMENT_KINDS, WEEKDAYS } from "@/lib/catalog";
import { removeCommitment, saveCommitment } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { DayPicker } from "@/components/forms/inputs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, SubmitButton, Checkbox } from "@/components/ui/form";

export type CommitmentRow = {
  id: string;
  title: string;
  kind: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  location?: string | null;
  flexible?: boolean;
};

function dayLabel(days: number[]) {
  if (days.length === 7) return "Every day";
  if ([1, 2, 3, 4, 5].every((d) => days.includes(d)) && days.length === 5) return "Weekdays";
  return WEEKDAYS.filter((d) => days.includes(d.value))
    .map((d) => d.short)
    .join(", ");
}

export function CommitmentList({ commitments }: { commitments: CommitmentRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!commitments.length) {
    return <p className="text-sm text-muted">No regular commitments yet. Add classes, coaching, commute or responsibilities so plans fit your real week.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {commitments.map((c) =>
        editing === c.id ? (
          <li key={c.id} className="p-3">
            <CommitmentForm initial={c} onDone={() => setEditing(null)} />
          </li>
        ) : (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <Clock className="size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted">
                {dayLabel(c.daysOfWeek)} · {c.startTime}–{c.endTime}
              </p>
            </div>
            <Badge>{COMMITMENT_KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}</Badge>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.title}`} onClick={() => setEditing(c.id)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${c.title}`}
              disabled={pending}
              onClick={() => startTransition(() => removeCommitment(c.id))}
            >
              <Trash2 />
            </Button>
          </li>
        ),
      )}
    </ul>
  );
}

export function CommitmentForm({ initial, onDone }: { initial?: CommitmentRow; onDone?: () => void }) {
  const action = saveCommitment.bind(null, initial?.id ?? null);
  return (
    <ActionForm action={action} resetOnSuccess={!initial} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2">
      <Field label="What is it?" htmlFor="c-title">
        <Input id="c-title" name="title" defaultValue={initial?.title} placeholder="e.g. College lectures" required />
        <FieldError name="title" />
      </Field>
      <Field label="Type" htmlFor="c-kind">
        <Select id="c-kind" name="kind" defaultValue={initial?.kind ?? "CLASS"}>
          {COMMITMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <DayPicker name="daysOfWeek" defaultValue={initial?.daysOfWeek ?? [1, 2, 3, 4, 5]} />
        <FieldError name="daysOfWeek" />
      </div>
      <Field label="Starts" htmlFor="c-start">
        <Input id="c-start" name="startTime" type="time" defaultValue={initial?.startTime ?? "09:00"} required />
      </Field>
      <Field label="Ends" htmlFor="c-end">
        <Input id="c-end" name="endTime" type="time" defaultValue={initial?.endTime ?? "14:00"} required />
        <FieldError name="endTime" />
      </Field>
      <Field label="Where (optional)" htmlFor="c-loc">
        <Input id="c-loc" name="location" defaultValue={initial?.location ?? ""} />
      </Field>
      <div className="flex items-end">
        <Checkbox name="flexible" label="This can move if needed" defaultChecked={initial?.flexible} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm">{initial ? "Save changes" : "Add commitment"}</SubmitButton>
        {onDone && initial ? (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}
