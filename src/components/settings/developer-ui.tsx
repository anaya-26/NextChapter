"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { clearTestClockAction, setTestClockAction } from "@/app/(app)/settings/actions";
import { loadDemoHistory, removeDemoHistory } from "@/app/(app)/settings/demo-actions";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, SubmitButton } from "@/components/ui/form";

export function TestClockForm({ defaultValue, active }: { defaultValue: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ActionForm action={setTestClockAction} className="flex flex-wrap items-end gap-3">
        <Field label="Simulated date and time" htmlFor="simulatedNow">
          <Input id="simulatedNow" name="simulatedNow" type="datetime-local" defaultValue={defaultValue} required />
        </Field>
        <SubmitButton>Set test clock</SubmitButton>
      </ActionForm>
      {active ? (
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => clearTestClockAction())}>
            Return to real time
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function DemoDataControls({ loaded }: { loaded: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await loadDemoHistory();
            if (res.ok) toast.success(res.message);
            else toast.error(res.message);
          })
        }
      >
        {loaded ? "Reload demonstration history" : "Load demonstration history"}
      </Button>
      {loaded ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await removeDemoHistory();
              toast.success(res.message);
            })
          }
        >
          Remove all demo data
        </Button>
      ) : null}
    </div>
  );
}
