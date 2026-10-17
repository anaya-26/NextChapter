"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { addMemoryAction, correctMemoryAction, forgetEverything, memoryAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";

type Item = {
  id: string;
  kind: string;
  content: string;
  source: string;
  certainty: string;
  evidence: string | null;
  correctedFrom: string | null;
  journalDate: string | null;
  journalEntryId: string | null;
};

const KIND_LABEL: Record<string, string> = {
  FACT: "Facts",
  PREFERENCE: "Preferences",
  GOAL_CONTEXT: "Goals & context",
  OBSTACLE: "Obstacles",
  PATTERN: "Patterns",
  STRENGTH: "Strengths",
  DIFFICULTY: "Difficulties",
};

const SOURCE_LABEL: Record<string, string> = {
  STUDENT: "You told NextChapter",
  CONVERSATION: "From a conversation",
  JOURNAL: "From your journal",
  PRACTICE: "From practice results",
  STUDY_LOG: "From your study log",
  INFERRED: "Noticed pattern",
  PROFILE: "From your profile",
};

export function MemoryList({ items }: { items: Item[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Nothing remembered yet"
        description="As you chat, reflect and practise, NextChapter may note helpful things here — always visible and always yours to change."
      />
    );
  }
  const groups = Object.entries(
    items.reduce<Record<string, Item[]>>((acc, i) => {
      (acc[i.kind] ??= []).push(i);
      return acc;
    }, {}),
  );
  return (
    <div className="flex flex-col gap-5">
      {groups.map(([kind, list]) => (
        <div key={kind}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{KIND_LABEL[kind] ?? kind}</h3>
          <ul className="flex flex-col gap-2">
            {list.map((m) => (
              <MemoryRow key={m.id} item={m} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MemoryRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      {editing ? (
        <ActionForm action={correctMemoryAction.bind(null, item.id)} onSuccess={() => setEditing(false)} className="flex flex-col gap-2">
          <Field label="Corrected statement" htmlFor={`m-${item.id}`}>
            <Input id={`m-${item.id}`} name="content" defaultValue={item.content} maxLength={400} autoFocus />
            <FieldError name="content" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton size="sm">Save correction</SubmitButton>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </ActionForm>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm">{item.content}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={item.certainty === "TENTATIVE" ? "warning" : "success"}>
                {item.certainty === "TENTATIVE" ? "Tentative" : item.certainty === "CONFIRMED" ? "Confirmed by you" : "Stated by you"}
              </Badge>
              <Badge>
                {SOURCE_LABEL[item.source] ?? item.source}
                {item.journalDate ? ` (${item.journalDate})` : ""}
              </Badge>
              {item.journalEntryId ? (
                <Link className="text-xs text-primary underline-offset-4 hover:underline" href={`/journal/${item.journalEntryId}`}>
                  View entry
                </Link>
              ) : null}
            </div>
            {item.evidence ? <p className="mt-1.5 text-xs text-muted">Why: {item.evidence}</p> : null}
            {item.correctedFrom ? <p className="mt-1 text-xs text-muted line-through">Originally: {item.correctedFrom}</p> : null}
          </div>
          <div className="flex shrink-0 gap-1">
            {item.certainty === "TENTATIVE" ? (
              <Button size="sm" variant="soft" disabled={pending} onClick={() => startTransition(() => memoryAction("confirm", item.id))}>
                <Check /> That&apos;s right
              </Button>
            ) : null}
            <Button size="icon-sm" variant="ghost" aria-label="Correct this" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete this memory" disabled={pending} onClick={() => startTransition(() => memoryAction("delete", item.id))}>
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AddMemoryForm() {
  return (
    <ActionForm action={addMemoryAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <Field label="Statement" htmlFor="mem-content">
        <Input id="mem-content" name="content" placeholder="e.g. I learn best with diagrams; I commute 1 hour by train" maxLength={400} />
        <FieldError name="content" />
      </Field>
      <Field label="Type" htmlFor="mem-kind">
        <Select id="mem-kind" name="kind" defaultValue="PREFERENCE">
          {Object.entries(KIND_LABEL)
            .filter(([k]) => k !== "PATTERN")
            .map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
        </Select>
      </Field>
      <SubmitButton>Remember</SubmitButton>
    </ActionForm>
  );
}

export function ForgetEverything() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="flex items-center gap-2 text-sm">
      Delete all memories?
      <Button size="sm" variant="danger" disabled={pending} onClick={() => startTransition(() => forgetEverything())}>
        Yes, forget all
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
      <Trash2 /> Forget everything
    </Button>
  );
}
