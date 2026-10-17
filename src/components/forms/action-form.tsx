"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionResult<unknown>, form: FormData) => Promise<ActionResult<unknown>>;

const FormStateContext = createContext<ActionResult<unknown>>({ ok: false });

/**
 * Form bound to a Server Action via useActionState. Shows toast feedback and makes field
 * errors available to <FieldError name="…" />. Works without JavaScript (progressive enhancement).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
  silent = false,
  id,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult<unknown>) => void;
  silent?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false } as ActionResult<unknown>);
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (state.ok) {
      if (state.message && !silent) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.(state);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, resetOnSuccess, silent]);

  return (
    <FormStateContext value={state}>
      <form ref={formRef} action={formAction} className={className} id={id} noValidate={false}>
        {children}
      </form>
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
