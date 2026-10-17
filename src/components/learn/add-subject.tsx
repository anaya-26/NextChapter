"use client";

import { createSubjectAction } from "@/app/(app)/learn/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Field, Input, SubmitButton } from "@/components/ui/form";

export function AddSubjectForm() {
  return (
    <ActionForm action={createSubjectAction} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end">
      <Field label="Subject" htmlFor="subject-name">
        <Input id="subject-name" name="name" placeholder="e.g. Physics, Financial Accounting" required maxLength={80} />
        <FieldError name="name" />
      </Field>
      <Field label="Code (optional)" htmlFor="subject-code">
        <Input id="subject-code" name="code" placeholder="e.g. PHY-201" maxLength={30} />
      </Field>
      <Field label="Exam date (optional)" htmlFor="subject-exam">
        <Input id="subject-exam" name="examDate" type="date" />
      </Field>
      <SubmitButton>Add subject</SubmitButton>
    </ActionForm>
  );
}
