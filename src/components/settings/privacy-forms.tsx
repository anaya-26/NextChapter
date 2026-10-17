"use client";

import { recordConsent, savePrivacy } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Checkbox, Field, Input, SubmitButton, Switch } from "@/components/ui/form";

type PrivacyState = {
  aiUseProfile: boolean;
  aiUseProgress: boolean;
  aiUseGoals: boolean;
  aiUseCalendar: boolean;
  aiUseJournal: boolean;
  aiInferPatterns: boolean;
  aiMemoryEnabled: boolean;
  communityVisible: boolean;
};

const ROWS: { key: keyof PrivacyState; title: string; text: string; lockable?: boolean }[] = [
  { key: "aiUseProfile", title: "Profile", text: "Your course, exams, languages and preferences — so explanations fit your level." },
  { key: "aiUseGoals", title: "Goals", text: "Your goals and current priority — so suggestions point the right way." },
  { key: "aiUseProgress", title: "Study progress", text: "Topic status, practice results, revision due and recurring mistakes." },
  { key: "aiUseCalendar", title: "Calendar", text: "Upcoming classes, deadlines and free time — for realistic plans." },
  {
    key: "aiUseJournal",
    title: "Journal (entries you choose)",
    text: "Only entries you individually mark as shareable. Turning this off also deletes everything learned from your journal.",
  },
  { key: "aiMemoryEnabled", title: "Memory", text: "Remember things across conversations. You can review every item under “What Kadam remembers”." },
  {
    key: "aiInferPatterns",
    title: "Notice patterns",
    text: "e.g. “evening sessions are often missed”. Always shown as tentative and open to correction. Off deletes inferred patterns.",
    lockable: true,
  },
  { key: "communityVisible", title: "Discoverable in community", text: "Let other students find you as a study buddy (pseudonymous handle only).", lockable: true },
];

export function PrivacyForm({ initial, locked }: { initial: PrivacyState; locked: boolean }) {
  return (
    <ActionForm action={savePrivacy} className="flex flex-col gap-1">
      <ul className="divide-y divide-border">
        {ROWS.map((row) => {
          const disabled = locked && row.lockable;
          return (
            <li key={row.key} className="flex items-start justify-between gap-4 py-3.5">
              <div>
                <label htmlFor={`p-${row.key}`} className="font-medium">
                  {row.title}
                </label>
                <p className="text-sm text-muted">{row.text}</p>
                {disabled ? <p className="mt-1 text-xs font-medium text-info">Needs parent or guardian consent first.</p> : null}
              </div>
              <Switch id={`p-${row.key}`} name={row.key} defaultChecked={initial[row.key] && !disabled} disabled={disabled} />
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end pt-3">
        <SubmitButton pendingLabel="Saving…">Save permissions</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ConsentForm() {
  return (
    <ActionForm action={recordConsent} className="flex flex-col gap-3">
      <Field label="Parent or guardian's name" htmlFor="guardianName">
        <Input id="guardianName" name="guardianName" required maxLength={80} />
        <FieldError name="guardianName" />
      </Field>
      <Checkbox
        name="confirm"
        label="I am this student's parent or legal guardian. I have read how Kadam handles data and I consent to the optional features above."
      />
      <FieldError name="confirm" />
      <div>
        <SubmitButton size="sm">Record consent</SubmitButton>
      </div>
    </ActionForm>
  );
}
