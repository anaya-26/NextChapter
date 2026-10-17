"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addOpportunityLinkAction,
  analyseGapsAction,
  answerInterviewAction,
  deleteOpportunityAction,
  deletePracticeAction,
  editOpportunityAction,
  planGapAction,
  saveOpportunityAction,
  setRequirementAction,
  unsaveOpportunityAction,
  updateApplicationAction,
} from "@/app/(app)/goals/opportunities/actions";
import { ActionForm, FieldError, FormMessage } from "@/components/forms/action-form";
import { DICTATION_NOTE, DictateButton } from "@/components/forms/dictate";
import { TagInput } from "@/components/forms/inputs";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { KIND_LABELS } from "./labels";

type Result = { ok: boolean; message?: string; data?: unknown };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) after?.(r);
    });
  return { pending, run };
}

export function AddLinkButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Link2 /> Add a link
      </Button>
      {open ? (
        <DialogContent title="Save an opportunity link" description="Paste the link to the original posting. Paste the posting text too and NextChapter will fill in the details — you can correct anything afterwards.">
          <ActionForm action={addOpportunityLinkAction} className="flex flex-col gap-4">
            <FormMessage />
            <Field label="Link to the posting" htmlFor="opp-url">
              <Input id="opp-url" name="sourceUrl" type="url" required placeholder="https://…" />
              <FieldError name="sourceUrl" />
            </Field>
            <Field label="Posting text (optional)" htmlFor="opp-text" hint="Copy the description from the page. It stays private to you.">
              <Textarea id="opp-text" name="postingText" className="min-h-32" />
            </Field>
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Or type the details yourself</summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Title" htmlFor="opp-title">
                  <Input id="opp-title" name="title" />
                </Field>
                <Field label="Organisation" htmlFor="opp-org">
                  <Input id="opp-org" name="organisation" />
                </Field>
                <Field label="Type" htmlFor="opp-kind">
                  <Select id="opp-kind" name="kind" defaultValue="">
                    <option value="">Work it out from the text</option>
                    {Object.entries(KIND_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deadline" htmlFor="opp-deadline">
                  <Input id="opp-deadline" name="deadline" type="date" />
                </Field>
                <Field label="Location" htmlFor="opp-loc">
                  <Input id="opp-loc" name="location" />
                </Field>
                <Field label="Mode" htmlFor="opp-mode">
                  <Select id="opp-mode" name="workMode" defaultValue="">
                    <option value="">Not stated</option>
                    <option value="REMOTE">Remote</option>
                    <option value="ONSITE">On-site</option>
                    <option value="HYBRID">Hybrid</option>
                  </Select>
                </Field>
                <Field label="Stipend / pay as published" htmlFor="opp-pay" className="sm:col-span-2">
                  <Input id="opp-pay" name="compensation" />
                </Field>
              </div>
            </details>
            <SubmitButton className="self-start" pendingLabel="Reading the posting…">
              Save opportunity
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function SaveToggle({ opportunityId, saved }: { opportunityId: string; saved: boolean }) {
  const { pending, run } = useRun();
  return saved ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unsaveOpportunityAction(opportunityId))}>
      Remove from my applications
    </Button>
  ) : (
    <Button size="sm" disabled={pending} onClick={() => run(() => saveOpportunityAction(opportunityId))}>
      <Plus /> Save
    </Button>
  );
}

export function EditOpportunityButton({ id, values }: { id: string; values: { title: string; organisation: string; location: string; compensation: string; deadline: string; requirements: string[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> Correct details
      </Button>
      {open ? (
        <DialogContent title="Correct the details" description="Match what the original posting says.">
          <ActionForm action={editOpportunityAction.bind(null, id)} onSuccess={() => setOpen(false)} className="flex flex-col gap-3">
            <Field label="Title" htmlFor="e-title">
              <Input id="e-title" name="title" defaultValue={values.title} required />
              <FieldError name="title" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Organisation" htmlFor="e-org">
                <Input id="e-org" name="organisation" defaultValue={values.organisation} />
              </Field>
              <Field label="Location" htmlFor="e-loc">
                <Input id="e-loc" name="location" defaultValue={values.location} />
              </Field>
              <Field label="Stipend / pay as published" htmlFor="e-pay">
                <Input id="e-pay" name="compensation" defaultValue={values.compensation} />
              </Field>
              <Field label="Deadline" htmlFor="e-deadline">
                <Input id="e-deadline" name="deadline" type="date" defaultValue={values.deadline} />
              </Field>
            </div>
            <TagInput name="requirements" label="Requirements listed in the posting" defaultValue={values.requirements} max={15} />
            <SubmitButton className="self-start">Save</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function DeleteOpportunityButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this saved link, its tracker and its calendar deadline?")) start(() => deleteOpportunityAction(id));
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export function TrackerForm({
  applicationId,
  values,
  statuses,
  cvs,
}: {
  applicationId: string;
  values: { status: string; notes: string; nextStep: string; nextStepDate: string; cvId: string };
  statuses: { value: string; label: string }[];
  cvs: { id: string; title: string }[];
}) {
  return (
    <ActionForm action={updateApplicationAction.bind(null, applicationId)} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Status" htmlFor="t-status">
          <Select id="t-status" name="status" defaultValue={values.status}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CV used" htmlFor="t-cv">
          <Select id="t-cv" name="cvId" defaultValue={values.cvId}>
            <option value="">None yet</option>
            {cvs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next step" htmlFor="t-next">
          <Input id="t-next" name="nextStep" defaultValue={values.nextStep} placeholder="e.g. Email the coordinator" />
          <FieldError name="nextStep" />
        </Field>
        <Field label="By when" htmlFor="t-next-date" hint="Adds a reminder to your calendar">
          <Input id="t-next-date" name="nextStepDate" type="date" defaultValue={values.nextStepDate} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="t-notes">
        <Textarea id="t-notes" name="notes" defaultValue={values.notes} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" className="self-start">
        Update tracker
      </SubmitButton>
    </ActionForm>
  );
}

export function AnalyseGapsButton({ applicationId, again }: { applicationId: string; again: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant={again ? "outline" : "primary"} disabled={pending} onClick={() => run(() => analyseGapsAction(applicationId))}>
      {pending ? "Comparing with your portfolio…" : again ? "Check again" : "Check my fit"}
    </Button>
  );
}

export function RequirementControls({ checkId, state, hasGoal }: { checkId: string; state: string; hasGoal: boolean }) {
  const router = useRouter();
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`rs-${checkId}`}>
        Your view
      </label>
      <Select id={`rs-${checkId}`} className="h-8 w-auto text-xs" value={state} disabled={pending} onChange={(e) => run(() => setRequirementAction(checkId, e.target.value as "MET" | "GAP" | "UNKNOWN"))}>
        <option value="MET">I meet this</option>
        <option value="GAP">Gap</option>
        <option value="UNKNOWN">I’ll check</option>
      </Select>
      {state === "GAP" && !hasGoal ? (
        <Button size="sm" variant="soft" disabled={pending} onClick={() => run(() => planGapAction(checkId), (r) => router.push((r.data as { href: string }).href))}>
          Make a plan
        </Button>
      ) : null}
    </div>
  );
}

export function InterviewAnswerForm({ question, applicationId, achievementId, lang }: { question: string; applicationId: string | null; achievementId: string | null; lang: string }) {
  const [answer, setAnswer] = useState("");
  return (
    <ActionForm action={answerInterviewAction} onSuccess={() => setAnswer("")} className="flex flex-col gap-2">
      <input type="hidden" name="question" value={question} />
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      {achievementId ? <input type="hidden" name="achievementId" value={achievementId} /> : null}
      <div className="flex items-start gap-2">
        <Field label="Your answer" htmlFor="iv-answer" className="flex-1">
          <Textarea id="iv-answer" name="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-36" placeholder="Answer as you would out loud. Situation → task → what you did → result." />
          <FieldError name="answer" />
        </Field>
        <DictateButton lang={lang} onText={(t) => setAnswer((a) => `${a}${a ? " " : ""}${t}`)} className="mt-7" />
      </div>
      <p className="text-[11px] text-muted">{DICTATION_NOTE}</p>
      <SubmitButton className="self-start" pendingLabel="Getting feedback…">
        Get feedback
      </SubmitButton>
    </ActionForm>
  );
}

export function DeletePracticeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => deletePracticeAction(id))} aria-label="Delete this practice answer">
      <Trash2 />
    </Button>
  );
}
