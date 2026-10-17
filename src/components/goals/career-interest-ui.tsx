"use client";

import { useState, useTransition } from "react";
import { Building2, Compass, MapPin, Pencil, Trash2 } from "lucide-react";
import { DOMAINS, WORK_MODES } from "@/lib/catalog";
import { removeCareerInterest, saveCareerInterest } from "@/app/(app)/goals/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { TagInput } from "@/components/forms/inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";

export type InterestView = {
  id: string;
  domain: string;
  roles: string[];
  companies: string[];
  cities: string[];
  workModes: string[];
  status: string;
  notes: string | null;
};

const ROLE_SUGGESTIONS = ["Software engineer intern", "Data analyst", "UX designer", "Research assistant", "Product analyst", "Content writer", "Marketing intern", "Lab intern"];
const COMPANY_SUGGESTIONS = ["TCS", "Infosys", "Wipro", "Google", "Microsoft", "Amazon", "Flipkart", "Zomato", "Reliance", "Tata Steel", "ISRO", "DRDO"];
const CITY_SUGGESTIONS = ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Delhi NCR", "Chennai", "Kolkata", "Ahmedabad", "Remote"];

export function InterestCard({ interest }: { interest: InterestView }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  if (editing) {
    return (
      <Card className="p-5">
        <InterestForm initial={interest} onDone={() => setEditing(false)} />
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Badge tone={interest.status === "SELECTED" ? "primary" : interest.status === "EXPLORING" ? "info" : "neutral"}>
              {interest.status === "SELECTED" ? "Chosen direction" : interest.status === "EXPLORING" ? "Exploring" : "Set aside"}
            </Badge>
          </div>
          <h3 className="font-semibold">{interest.domain}</h3>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${interest.domain}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${interest.domain}`}
            disabled={pending}
            onClick={() => startTransition(() => removeCareerInterest(interest.id))}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <dl className="grid gap-2 text-sm">
        {interest.roles.length ? (
          <div className="flex gap-2">
            <dt className="sr-only">Roles</dt>
            <Compass className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <dd>{interest.roles.join(", ")}</dd>
          </div>
        ) : null}
        {interest.companies.length ? (
          <div className="flex gap-2">
            <dt className="sr-only">Companies</dt>
            <Building2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <dd>{interest.companies.join(", ")}</dd>
          </div>
        ) : null}
        {interest.cities.length || interest.workModes.length ? (
          <div className="flex gap-2">
            <dt className="sr-only">Location and work mode</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <dd>
              {[...interest.cities, ...interest.workModes.map((w) => WORK_MODES.find((m) => m.value === w)?.label ?? w)].join(" · ")}
            </dd>
          </div>
        ) : null}
      </dl>
      {interest.notes ? <p className="text-sm text-muted">{interest.notes}</p> : null}
    </Card>
  );
}

export function InterestForm({ initial, onDone }: { initial?: InterestView; onDone?: () => void }) {
  const key = initial?.id ?? "new";
  return (
    <ActionForm action={saveCareerInterest.bind(null, initial?.id ?? null)} resetOnSuccess={!initial} onSuccess={onDone} className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Domain" htmlFor={`ci-d-${key}`}>
          <Input id={`ci-d-${key}`} name="domain" list={`domains-${key}`} defaultValue={initial?.domain} placeholder="e.g. Data science & AI" required />
          <datalist id={`domains-${key}`}>
            {DOMAINS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <FieldError name="domain" />
        </Field>
        <Field label="Status" htmlFor={`ci-s-${key}`}>
          <Select id={`ci-s-${key}`} name="status" defaultValue={initial?.status ?? "EXPLORING"}>
            <option value="SELECTED">Chosen direction</option>
            <option value="EXPLORING">Exploring</option>
            <option value="DROPPED">Set aside</option>
          </Select>
        </Field>
      </div>
      <TagInput name="roles" label="Target roles" suggestions={ROLE_SUGGESTIONS} defaultValue={initial?.roles} max={10} />
      <TagInput name="companies" label="Companies you'd like to work with (including large ones)" suggestions={COMPANY_SUGGESTIONS} defaultValue={initial?.companies} max={15} />
      <TagInput name="cities" label="Preferred cities" suggestions={CITY_SUGGESTIONS} defaultValue={initial?.cities} max={10} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Work mode</legend>
        <div className="flex flex-wrap gap-2">
          {WORK_MODES.map((m) => (
            <label key={m.value} className="cursor-pointer">
              <input type="checkbox" name="workModes" value={m.value} defaultChecked={initial?.workModes.includes(m.value)} className="peer sr-only" />
              <span className="inline-flex rounded-full border border-border-strong px-3 py-1.5 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                {m.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notes (optional)" htmlFor={`ci-n-${key}`}>
        <Textarea id={`ci-n-${key}`} name="notes" defaultValue={initial?.notes ?? ""} className="min-h-16" maxLength={600} />
      </Field>
      <div className="flex gap-2">
        <SubmitButton size="sm">{initial ? "Save" : "Add career interest"}</SubmitButton>
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}
