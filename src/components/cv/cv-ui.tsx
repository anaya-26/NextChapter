"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCvAction, deleteCvAction, moveSectionAction, resetOverrideAction, resolveSuggestionAction, saveCvDetailsAction, tailorCvAction } from "@/app/(app)/goals/cv/actions";
import { ActionForm, FieldError, FormMessage } from "@/components/forms/action-form";
import { TagInput } from "@/components/forms/inputs";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import type { SectionKey } from "@/lib/cv-sections";

export function CreateCvForm({ defaultTitle = "", targetOpportunityId, opportunities }: { defaultTitle?: string; targetOpportunityId?: string; opportunities?: { id: string; title: string }[] }) {
  return (
    <ActionForm action={createCvAction} className="flex flex-col gap-3">
      <FormMessage />
      <Field label="Name this CV" htmlFor="cv-title">
        <Input id="cv-title" name="title" defaultValue={defaultTitle} placeholder="e.g. General, Research internships" required />
        <FieldError name="title" />
      </Field>
      {targetOpportunityId ? (
        <input type="hidden" name="targetOpportunityId" value={targetOpportunityId} />
      ) : opportunities?.length ? (
        <Field label="Tailor for (optional)" htmlFor="cv-target">
          <Select id="cv-target" name="targetOpportunityId" defaultValue="">
            <option value="">No specific opportunity</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <SubmitButton size="sm" className="self-start" pendingLabel="Building…">
        Build CV from my approved portfolio
      </SubmitButton>
    </ActionForm>
  );
}

export function CvDetailsForm({
  cvId,
  values,
  achievements,
  education,
  skillSuggestions,
}: {
  cvId: string;
  values: { title: string; headline: string; summary: string; contactLine: string; achievementIds: string[]; educationIds: string[]; skills: string[] };
  achievements: { id: string; title: string; kind: string }[];
  education: { id: string; line: string }[];
  skillSuggestions: string[];
}) {
  return (
    <ActionForm action={saveCvDetailsAction.bind(null, cvId)} className="flex flex-col gap-4">
      <Field label="CV name (only you see this)" htmlFor="cvd-title">
        <Input id="cvd-title" name="title" defaultValue={values.title} required />
      </Field>
      <Field label="Headline" htmlFor="cvd-headline" hint="e.g. Second-year B.Sc Physics student, Pune">
        <Input id="cvd-headline" name="headline" defaultValue={values.headline} />
      </Field>
      <Field label="Contact line" htmlFor="cvd-contact" hint="What you want on the CV — email, phone, city, portfolio link. Kadam doesn’t add any by itself.">
        <Input id="cvd-contact" name="contactLine" defaultValue={values.contactLine} />
      </Field>
      <Field label="Summary (your words)" htmlFor="cvd-summary" hint="Two or three honest sentences about what you’ve done and what you’re looking for.">
        <Textarea id="cvd-summary" name="summary" defaultValue={values.summary} className="min-h-20" />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Approved achievements to include</legend>
        {achievements.length ? (
          achievements.map((a) => <Checkbox key={a.id} name="achievementIds" value={a.id} defaultChecked={values.achievementIds.includes(a.id)} label={a.title} />)
        ) : (
          <p className="text-sm text-muted">Approve achievements in your portfolio to add them here.</p>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Education</legend>
        {education.length ? education.map((e) => <Checkbox key={e.id} name="educationIds" value={e.id} defaultChecked={values.educationIds.includes(e.id)} label={e.line} />) : <p className="text-sm text-muted">Add education in your portfolio.</p>}
      </fieldset>
      <TagInput name="skills" label="Skills" defaultValue={values.skills} suggestions={skillSuggestions} hint="Suggestions come from your approved achievements. Only list skills you can show." />
      <SubmitButton size="sm" className="self-start">
        Save CV
      </SubmitButton>
    </ActionForm>
  );
}

export function SectionOrder({ cvId, order, labels }: { cvId: string; order: SectionKey[]; labels: Record<SectionKey, string> }) {
  const [pending, start] = useTransition();
  return (
    <ol className="flex flex-col gap-1">
      {order.map((k, i) => (
        <li key={k} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
          <span className="flex-1">{labels[k]}</span>
          <Button size="icon-sm" variant="ghost" disabled={pending || i === 0} onClick={() => start(() => moveSectionAction(cvId, k, -1))} aria-label={`Move ${labels[k]} up`}>
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={pending || i === order.length - 1} onClick={() => start(() => moveSectionAction(cvId, k, 1))} aria-label={`Move ${labels[k]} down`}>
            <ArrowDown />
          </Button>
        </li>
      ))}
    </ol>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  return { pending, run };
}

export function TailorForm({ cvId, opportunities, current }: { cvId: string; opportunities: { id: string; title: string }[]; current: string | null }) {
  const { pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const id = new FormData(e.currentTarget).get("opportunityId");
        if (typeof id === "string" && id) run(() => tailorCvAction(cvId, id));
      }}
    >
      <Field label="Tailor for" htmlFor="tailor-opp" className="flex-1">
        <Select id="tailor-opp" name="opportunityId" defaultValue={current ?? ""} required>
          <option value="" disabled>
            Choose a saved opportunity
          </option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Tailoring…" : "Tailor"}
      </Button>
    </form>
  );
}

export function SuggestionButtons({ cvId, achievementId }: { cvId: string; achievementId: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => resolveSuggestionAction(cvId, achievementId, true))}>
        Use this line
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveSuggestionAction(cvId, achievementId, false))}>
        Keep mine
      </Button>
    </div>
  );
}

export function ResetOverrideButton({ cvId, achievementId }: { cvId: string; achievementId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs print:hidden" disabled={pending} onClick={() => start(() => resetOverrideAction(cvId, achievementId))}>
      Use original wording
    </Button>
  );
}

export function DeleteCvButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this CV? Your portfolio isn’t affected.")) start(() => deleteCvAction(id));
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer /> Print or save as PDF
    </Button>
  );
}
