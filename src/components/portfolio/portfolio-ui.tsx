"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { approveAchievementAction, deleteAchievementAction, deleteEducationAction, saveAchievementAction, saveEducationAction, withdrawAchievementAction } from "@/app/(app)/goals/portfolio/actions";
import { ActionForm, FieldError, FormMessage } from "@/components/forms/action-form";
import { TagInput } from "@/components/forms/inputs";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";

export type AchievementFormValues = {
  kind: string;
  title: string;
  organisation: string;
  role: string;
  startMonth: string;
  endMonth: string;
  description: string;
  outcomes: string;
  skills: string[];
  subjects: string[];
  evidenceLinks: string[];
  files: { key: string; id: string; name: string }[];
};

export const emptyAchievement: AchievementFormValues = { kind: "PROJECT", title: "", organisation: "", role: "", startMonth: "", endMonth: "", description: "", outcomes: "", skills: [], subjects: [], evidenceLinks: [], files: [] };

export function AchievementForm({ id, values, kinds, skillSuggestions }: { id: string | null; values: AchievementFormValues; kinds: { value: string; label: string }[]; skillSuggestions: string[] }) {
  const router = useRouter();
  return (
    <ActionForm
      action={saveAchievementAction.bind(null, id)}
      onSuccess={(r) => {
        const saved = (r.data as { id?: string } | undefined)?.id;
        if (saved) router.push(`/goals/portfolio/${saved}`);
      }}
      className="flex flex-col gap-4"
    >
      <FormMessage />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="What kind of achievement?" htmlFor="a-kind">
          <Select id="a-kind" name="kind" defaultValue={values.kind}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="a-title">
          <Input id="a-title" name="title" defaultValue={values.title} required placeholder="e.g. Weather station with Arduino" />
          <FieldError name="title" />
        </Field>
        <Field label="Organisation (optional)" htmlFor="a-org">
          <Input id="a-org" name="organisation" defaultValue={values.organisation} placeholder="School, college, club, company…" />
        </Field>
        <Field label="Your role (optional)" htmlFor="a-role">
          <Input id="a-role" name="role" defaultValue={values.role} placeholder="e.g. Team lead, Volunteer" />
        </Field>
        <Field label="Started" htmlFor="a-start">
          <Input id="a-start" name="startMonth" type="month" defaultValue={values.startMonth} />
        </Field>
        <Field label="Finished (leave empty if ongoing)" htmlFor="a-end">
          <Input id="a-end" name="endMonth" type="month" defaultValue={values.endMonth} />
          <FieldError name="endMonth" />
        </Field>
      </div>
      <Field label="What did you do?" htmlFor="a-desc" hint="Plain facts in your own words — this becomes your CV line.">
        <Textarea id="a-desc" name="description" defaultValue={values.description} className="min-h-24" required />
        <FieldError name="description" />
      </Field>
      <Field label="What came of it? (optional)" htmlFor="a-out" hint="Real outcomes only: what changed, who used it, what you learned.">
        <Textarea id="a-out" name="outcomes" defaultValue={values.outcomes} className="min-h-16" />
      </Field>
      <TagInput name="skills" label="Skills you actually used" defaultValue={values.skills} suggestions={skillSuggestions} max={15} hint="Only skills this shows. Studying something is tracked separately." />
      <TagInput name="subjects" label="Related subjects (optional)" defaultValue={values.subjects} max={10} />
      <TagInput name="evidenceLinks" label="Evidence links" defaultValue={values.evidenceLinks} max={5} placeholder="https://… then Enter" hint="A repository, video, certificate page, published article or photo album." />
      <Field label="Evidence files (PDF or images, up to 3)" htmlFor="a-files" hint="Stored privately — only you can open them.">
        <Input id="a-files" name="evidence" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple />
      </Field>
      {values.files.length ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Attached files</legend>
          {values.files.map((f) => (
            <Checkbox key={f.key} name="removeFile" value={f.key} label={`Remove ${f.name}`} />
          ))}
        </fieldset>
      ) : null}
      {id ? <p className="text-xs text-muted">Saving changes takes this out of your CVs until you approve it again.</p> : null}
      <SubmitButton className="self-start" pendingLabel="Saving…">
        {id ? "Save changes" : "Save as draft"}
      </SubmitButton>
    </ActionForm>
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

export function ApproveButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, run } = useRun();
  if (!confirming)
    return (
      <Button size="sm" onClick={() => setConfirming(true)}>
        <CheckCircle2 /> Approve
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
      <p>This is accurate, it’s my own work (or my part of a team’s work is clear), and I can back it up if asked.</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => approveAchievementAction(id))}>
          Yes, approve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Not yet
        </Button>
      </div>
    </div>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => withdrawAchievementAction(id))}>
      <Undo2 /> Take out of CVs
    </Button>
  );
}

export function DeleteAchievementButton({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this achievement and its evidence files?")) return;
        start(async () => {
          await deleteAchievementAction(id);
          if (redirectTo) router.push(redirectTo);
        });
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export type EducationValues = { qualification: string; institution: string; board: string; startYear: string; endYear: string; current: boolean; result: string };

export function EducationDialog({ id, values }: { id: string | null; values?: EducationValues }) {
  const [open, setOpen] = useState(false);
  const v = values ?? { qualification: "", institution: "", board: "", startYear: "", endYear: "", current: false, result: "" };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={id ? "ghost" : "outline"} onClick={() => setOpen(true)} aria-label={id ? `Edit ${v.qualification}` : undefined}>
        {id ? <Pencil /> : <Plus />} {id ? "Edit" : "Add education"}
      </Button>
      {open ? (
        <DialogContent title={id ? "Edit education" : "Add education"} description="As it appears on your marksheet or certificate.">
          <ActionForm action={saveEducationAction.bind(null, id)} onSuccess={() => setOpen(false)} className="flex flex-col gap-3">
            <Field label="Qualification" htmlFor="e-q">
              <Input id="e-q" name="qualification" defaultValue={v.qualification} placeholder="e.g. Class 12 (Science), B.Sc Physics" required />
              <FieldError name="qualification" />
            </Field>
            <Field label="School or college" htmlFor="e-i">
              <Input id="e-i" name="institution" defaultValue={v.institution} required />
              <FieldError name="institution" />
            </Field>
            <Field label="Board or university (optional)" htmlFor="e-b">
              <Input id="e-b" name="board" defaultValue={v.board} placeholder="e.g. CBSE, Maharashtra State Board, SPPU" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start year" htmlFor="e-sy">
                <Input id="e-sy" name="startYear" inputMode="numeric" defaultValue={v.startYear} />
                <FieldError name="startYear" />
              </Field>
              <Field label="End year" htmlFor="e-ey">
                <Input id="e-ey" name="endYear" inputMode="numeric" defaultValue={v.endYear} />
                <FieldError name="endYear" />
              </Field>
            </div>
            <Checkbox name="current" defaultChecked={v.current} label="I’m studying this now" />
            <Field label="Result as stated (optional)" htmlFor="e-r" hint="e.g. 91.4%, CGPA 8.2 — exactly as on your marksheet">
              <Input id="e-r" name="result" defaultValue={v.result} />
            </Field>
            <SubmitButton className="self-start">Save</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function DeleteEducationButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => start(() => deleteEducationAction(id))} aria-label="Delete education record">
      <Trash2 />
    </Button>
  );
}
