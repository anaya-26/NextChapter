"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { completeExplorationAction, createDomainGoalAction, dropExplorationAction, generateCareerReviewAction, reviewFeedbackAction, startExplorationAction } from "@/app/(app)/goals/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Field, SubmitButton, Textarea } from "@/components/ui/form";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  return { pending, run };
}

export function CareerReviewButton({ label }: { label: string }) {
  const { pending, run } = useRun();
  return (
    <Button disabled={pending} onClick={() => run(() => generateCareerReviewAction())}>
      {pending ? "Reviewing your evidence…" : label}
    </Button>
  );
}

export function StartExplorationButton({ reviewId, index, domain, label = "Try this exploration" }: { reviewId?: string; index?: number; domain?: string; label?: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => startExplorationAction({ reviewId, index, domain }))}>
      {label}
    </Button>
  );
}

export function CreateDomainGoalButton({ domain }: { domain: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" disabled={pending} onClick={() => run(() => createDomainGoalAction(domain))}>
      Make this a goal with milestones
    </Button>
  );
}

export function CompleteExplorationForm({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <ActionForm action={completeExplorationAction.bind(null, id)} className="flex flex-col gap-3">
      <Field label="What did you notice? What did you enjoy or dislike?" htmlFor={`exp-${id}`}>
        <Textarea id={`exp-${id}`} name="reflection" className="min-h-16" />
        <FieldError name="reflection" />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Now I’m…</legend>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["MORE", "more interested"],
            ["SAME", "about the same"],
            ["LESS", "less interested"],
          ].map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="interest" value={v} required className="peer sr-only" />
              <span className="inline-flex rounded-full border border-border-strong px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <SubmitButton size="sm">Mark complete</SubmitButton>
        <Button size="sm" variant="ghost" type="button" disabled={pending} onClick={() => start(() => dropExplorationAction(id))}>
          Drop it
        </Button>
      </div>
    </ActionForm>
  );
}

export function ReviewFeedbackForm({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  return (
    <ActionForm action={reviewFeedbackAction.bind(null, reviewId)} className="flex flex-col gap-2">
      <Field label="Does this feel right? What’s missing?" htmlFor={`fb-${reviewId}`}>
        <Textarea id={`fb-${reviewId}`} name="feedback" defaultValue={existing ?? ""} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" variant="outline" className="self-start">
        Save feedback
      </SubmitButton>
    </ActionForm>
  );
}
