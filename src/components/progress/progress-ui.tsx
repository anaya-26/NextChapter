"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  abandonExperimentAction,
  completeExperimentAction,
  customExperimentAction,
  proposeExperimentAction,
  setDisplayPrefsAction,
  startExperimentAction,
} from "@/app/(app)/journal/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SubmitButton, Switch, Textarea } from "@/components/ui/form";
import { METRIC_LABELS } from "@/lib/experiments";

export function DisplayPrefs({ quiet, showGrowth }: { quiet: boolean; showGrowth: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-3">
        <Switch checked={quiet} disabled={pending} onCheckedChange={(v) => start(() => setDisplayPrefsAction({ quietMode: v }))} aria-label="Quiet interface" />
        <span>
          <span className="font-medium">Quiet interface</span>
          <span className="block text-muted">Hide XP, levels, badges and celebrations. Your real progress stays visible.</span>
        </span>
      </label>
      {!quiet ? (
        <label className="flex items-center gap-3">
          <Switch checked={showGrowth} disabled={pending} onCheckedChange={(v) => start(() => setDisplayPrefsAction({ showGrowthVisual: v }))} aria-label="Show the Kadamba tree" />
          <span className="font-medium">Show my Kadamba tree</span>
        </label>
      ) : null}
    </div>
  );
}

export function ProposeTemplateButton({ templateId, label = "Try this" }: { templateId: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => proposeExperimentAction(templateId))}>
      {label}
    </Button>
  );
}

export function StartExperimentButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await startExperimentAction(id);
            (r.ok ? toast.success : toast.error)(r.message ?? "");
          })
        }
      >
        Start now
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => abandonExperimentAction(id))}>
        Remove
      </Button>
    </div>
  );
}

export function CompleteExperimentForm({ id, ended }: { id: string; ended: boolean }) {
  const [pending, start] = useTransition();
  return (
    <ActionForm action={completeExperimentAction.bind(null, id)} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">{ended ? "How did it go?" : "Finishing early? How did it go so far?"}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["HELPED", "It helped"],
            ["NO_CHANGE", "No real change"],
            ["WORSE", "It made things harder"],
            ["UNSURE", "Not sure"],
          ].map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="verdict" value={v} required className="peer sr-only" />
              <span className="inline-flex rounded-full border border-border-strong px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">{l}</span>
            </label>
          ))}
        </div>
        <FieldError name="verdict" />
      </fieldset>
      <Field label="What did you notice? (optional)" htmlFor={`refl-${id}`}>
        <Textarea id={`refl-${id}`} name="reflection" className="min-h-16" />
      </Field>
      <div className="flex gap-2">
        <SubmitButton size="sm">Save my review</SubmitButton>
        <Button size="sm" variant="ghost" type="button" disabled={pending} onClick={() => start(() => abandonExperimentAction(id))}>
          Stop without reviewing
        </Button>
      </div>
    </ActionForm>
  );
}

export function CustomExperimentForm() {
  return (
    <ActionForm action={customExperimentAction} resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Name" htmlFor="cx-title">
        <Input id="cx-title" name="title" placeholder="e.g. Study at the library" maxLength={120} />
        <FieldError name="title" />
      </Field>
      <Field label="What I’ll measure" htmlFor="cx-metric">
        <Select id="cx-metric" name="metric" defaultValue="session_completion">
          {Object.entries(METRIC_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="The change" htmlFor="cx-change" className="sm:col-span-2">
        <Input id="cx-change" name="change" placeholder="What will you do differently?" maxLength={400} />
        <FieldError name="change" />
      </Field>
      <Field label="What I expect" htmlFor="cx-hyp" className="sm:col-span-2">
        <Input id="cx-hyp" name="hypothesis" placeholder="e.g. I’ll finish more sessions" maxLength={400} />
        <FieldError name="hypothesis" />
      </Field>
      <Field label="Days" htmlFor="cx-days">
        <Input id="cx-days" name="days" type="number" min={5} max={28} defaultValue={7} className="w-24" />
      </Field>
      <SubmitButton size="sm" className="self-end justify-self-start">
        Add experiment
      </SubmitButton>
    </ActionForm>
  );
}
