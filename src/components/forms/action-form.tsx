"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { FormPendingContext } from "@/components/ui/form";

type ServerAction = (prev: ActionResult<unknown>, form: FormData) => Promise<ActionResult<unknown>>;

const FormStateContext = createContext<ActionResult<unknown>>({ ok: false });

/**
 * Form bound to a Server Action via useActionState. Shows toast feedback and makes field
 * errors available to <FieldError name="…" />. Works without JavaScript (progressive enhancement).
 * With JavaScript, it submits through a transition so a failed submission keeps what the student
 * typed (React would otherwise reset the form); successful submissions reset as before.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  silent = false,
  id,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  onSuccess?: (result: ActionResult<unknown>) => void;
  silent?: boolean;
  id?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { ok: false } as ActionResult<unknown>);
  const formRef = useRef<HTMLFormElement>(null);
  const notifySuccess = useEffectEvent((result: ActionResult<unknown>) => onSuccess?.(result));

  useEffect(() => {
    if (state.ok) {
      if (state.message && !silent) toast.success(state.message);
      formRef.current?.reset();
      notifySuccess(state);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, silent]);

  return (
    <FormStateContext value={state}>
      <FormPendingContext value={isPending}>
        <form
          ref={formRef}
          action={formAction}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
            startTransition(() => formAction(data));
          }}
          className={className}
          id={id}
          noValidate={false}
        >
          {children}
        </form>
      </FormPendingContext>
    </FormStateContext>
  );
}

export function useFormResult() {
  return useContext(FormStateContext);
}

export function FieldError({ name, className }: { name: string; className?: string }) {
  const state = useFormResult();
  const message = state.fieldErrors?.[name];
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-xs font-medium text-danger", className)}>
      {message}
    </p>
  );
}

/** Inline (non-toast) summary of the last result, for forms where context matters. */
export function FormMessage({ className }: { className?: string }) {
  const state = useFormResult();
  if (!state.message || state.ok) return null;
  return (
    <p role="alert" className={cn("rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger", className)}>
      {state.message}
    </p>
  );
}
