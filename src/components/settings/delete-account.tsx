"use client";

import { deleteAccount } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Field, Input, SubmitButton } from "@/components/ui/form";

export function DeleteAccountForm() {
  return (
    <details className="rounded-xl border border-danger/30 p-3">
      <summary className="cursor-pointer text-sm font-medium text-danger">Delete my account</summary>
      <ActionForm action={deleteAccount} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          This permanently deletes your profile, syllabi, notes, uploads, journal, plans and community posts. It cannot be undone.
        </p>
        <Field label="Password" htmlFor="del-password">
          <Input id="del-password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label='Type "DELETE" to confirm' htmlFor="del-confirm">
          <Input id="del-confirm" name="confirmText" autoComplete="off" required />
          <FieldError name="confirmText" />
        </Field>
        <div>
          <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
            Delete everything
          </SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
