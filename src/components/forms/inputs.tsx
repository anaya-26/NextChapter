"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKDAYS } from "@/lib/catalog";

/** Chip list input. Submits one hidden input per value (read with formData.getAll(name)). */
export function TagInput({
  name,
  label,
  suggestions = [],
  defaultValue = [],
  placeholder = "Type and press Enter",
  max = 30,
  hint,
}: {
  name: string;
  label: string;
  suggestions?: readonly string[];
  defaultValue?: string[];
  placeholder?: string;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  const [values, setValues] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setValues([...values, v]);
    setDraft("");
  };
  const remove = (v: string) => setValues(values.filter((x) => x !== v));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  };
  const visibleSuggestions = useMemo(
    () =>
      suggestions
        .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
        .filter((s) => !draft || s.toLowerCase().includes(draft.toLowerCase()))
        .slice(0, 12),
    [suggestions, values, draft],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-2 py-1.5 focus-within:outline-2 focus-within:outline-focus">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-sm text-primary-soft-fg">
            {v}
            <button type="button" onClick={() => remove(v)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${v}`}>
              <X className="size-3.5" aria-hidden />
            </button>
            <input type="hidden" name={name} value={v} />
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-subtle"
        />
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {visibleSuggestions.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label={`Suggestions for ${label}`}>
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-muted hover:border-primary hover:text-fg"
            >
              <Plus className="size-3" aria-hidden />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DayPicker({ name, defaultValue = [] }: { name: string; defaultValue?: number[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => (
          <label key={d.value} className="cursor-pointer">
            <input type="checkbox" name={name} value={d.value} defaultChecked={defaultValue.includes(d.value)} className="peer sr-only" />
            <span className="inline-flex h-9 w-11 items-center justify-center rounded-lg border border-border-strong text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-fg peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
              {d.short}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TONE_SAMPLES = [
  { max: 33, text: "Hey! Let's knock out two quick questions on Ohm's law — I'll be right here with hints. 🙂" },
  { max: 66, text: "Good momentum. Next: 20 minutes on Ohm's law, then three practice questions to check it stuck." },
  { max: 100, text: "You planned Ohm's law for today and it's still open. Start the 20-minute session now; we'll review at 7 pm." },
];

export function ToneSlider({ name, defaultValue = 30 }: { name: string; defaultValue?: number }) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const sample = TONE_SAMPLES.find((s) => value <= s.max) ?? TONE_SAMPLES[2];
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Companion tone
      </label>
      <input
        id={id}
        name={name}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
        aria-valuetext={value < 34 ? "Friendly study buddy" : value < 67 ? "Supportive coach" : "Firm, respectful mentor"}
      />
      <div className="flex justify-between text-xs text-muted">
        <span>Friendly study buddy</span>
        <span>Firm, respectful mentor</span>
      </div>
      <p className="rounded-xl bg-surface-2 p-3 text-sm italic text-muted" aria-live="polite">
        “{sample.text}”
      </p>
    </div>
  );
}

export function ChoiceCards({
  name,
  options,
  defaultValue,
  columns = 2,
}: {
  name: string;
  options: readonly { value: string; label: string; description?: string }[];
  defaultValue?: string | null;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="peer sr-only" />
          <span className="flex h-full flex-col gap-0.5 rounded-xl border border-border-strong bg-surface p-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
            <span className="font-medium">{o.label}</span>
            {o.description ? <span className="text-xs text-muted">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}
