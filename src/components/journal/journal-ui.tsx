"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Lock, Mic, RotateCcw, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  acceptSuggestionAction,
  checkInAction,
  createEntryAction,
  deleteEntryAction,
  dismissSuggestionAction,
  generateReviewAction,
  setEntryAiAccessAction,
  updateEntryAction,
} from "@/app/(app)/journal/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { TagInput } from "@/components/forms/inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiLabel } from "@/components/ui/feedback";
import { Field, Input, Select, SubmitButton, Switch, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const ENERGY_LABELS = ["Very low", "Low", "Medium", "High", "Very high"];

export const MOODS = [
  { value: 1, label: "Rough", face: "😣" },
  { value: 2, label: "Low", face: "😕" },
  { value: 3, label: "Okay", face: "😐" },
  { value: 4, label: "Good", face: "🙂" },
  { value: 5, label: "Great", face: "😄" },
];

function ChipRadio({ name, options, required }: { name: string; options: { value: number; label: string; face?: string }[]; required?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={name} value={o.value} required={required} className="peer sr-only" />
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
            {o.face ? <span aria-hidden>{o.face}</span> : null}
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function AiAccessField({ masterOn, defaultOn = false }: { masterOn: boolean; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn && masterOn);
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 text-sm">
      <Switch checked={on} onCheckedChange={setOn} disabled={!masterOn} aria-label="Let the AI read this entry" />
      <input type="hidden" name="aiAccess" value={on ? "on" : ""} />
      <div>
        <p className="font-medium">Let the AI read this entry</p>
        <p className="text-muted">
          {masterOn
            ? "Used for suggestions, your weekly review and to remember useful things (which you can see and delete). Off by default."
            : "Journal access is off in Privacy settings, so the AI never reads your journal."}
        </p>
      </div>
    </div>
  );
}

export function CheckInCard({ masterOn }: { masterOn: boolean }) {
  return (
    <ActionForm action={checkInAction} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">How are you feeling today?</legend>
        <ChipRadio name="mood" options={MOODS} required />
        <FieldError name="mood" />
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Energy (optional)</legend>
        <ChipRadio name="energy" options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: ENERGY_LABELS[v - 1] }))} />
      </fieldset>
      <label htmlFor="checkin-text" className="sr-only">
        One line about today
      </label>
      <Input id="checkin-text" name="text" placeholder="One line about today (optional)" maxLength={500} />
      {masterOn ? <AiAccessField masterOn={masterOn} /> : null}
      <SubmitButton size="sm" className="self-start">
        Check in
      </SubmitButton>
    </ActionForm>
  );
}

/** Records a voice note with the browser and attaches it to the surrounding form as a file. */
export function VoiceRecorder({ name }: { name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "done" | "unsupported">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const start = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note.${blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm"}`, { type: blob.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        if (input.current) input.current.files = dt.files;
        setUrl(URL.createObjectURL(blob));
        setState("done");
      };
      recorder.current = rec;
      setSeconds(0);
      rec.start();
      setState("recording");
    } catch {
      toast.error("Microphone permission was refused.");
    }
  };
  const stop = () => recorder.current?.stop();
  const clear = () => {
    if (input.current) input.current.value = "";
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setState("idle");
  };

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        {state === "recording" ? (
          <Button type="button" size="sm" variant="danger" onClick={stop}>
            <Square /> Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </Button>
        ) : state === "done" ? (
          <>
            {url ? <audio src={url} controls className="h-9" /> : null}
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              <RotateCcw /> Discard
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={start}>
            <Mic /> Record a voice note
          </Button>
        )}
      </div>
      {state === "unsupported" ? <p className="text-xs text-danger">This browser can’t record audio — type instead.</p> : null}
    </div>
  );
}

function PhotoPicker({ name }: { name: string }) {
  const [previews, setPreviews] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-2">
        <ImagePlus className="size-4" aria-hidden /> Add photos (up to 4)
        <input
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            previews.forEach((p) => URL.revokeObjectURL(p));
            setPreviews(files.map((f) => URL.createObjectURL(f)));
          }}
        />
      </label>
      {previews.length ? (
        <div className="flex gap-2">
          {previews.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- local preview before upload
            <img key={p} src={p} alt="" className="size-16 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EntryForm({ todayKey, prefill, masterOn, topicSuggestions }: { todayKey: string; prefill: { planned: string; actual: string; topics: string[] }; masterOn: boolean; topicSuggestions: string[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("REFLECTION");
  return (
    <ActionForm
      action={createEntryAction}
      onSuccess={(r) => {
        const id = (r.data as { id?: string } | undefined)?.id;
        if (id) router.push(`/journal/${id}`);
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Type" htmlFor="entry-kind">
          <Select id="entry-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="REFLECTION">Reflection</option>
            <option value="NOTE">Private note</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="entry-date">
          <Input id="entry-date" name="date" type="date" defaultValue={todayKey} max={todayKey} />
        </Field>
        <Field label="Title (optional)" htmlFor="entry-title">
          <Input id="entry-title" name="title" maxLength={160} />
        </Field>
      </div>
      {kind === "REFLECTION" && (prefill.planned || prefill.actual) ? (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="font-medium">From your study log today</p>
          {prefill.planned ? <p className="text-muted">Planned: {prefill.planned}</p> : null}
          <p className="text-muted">Actual: {prefill.actual}</p>
          <input type="hidden" name="plannedSummary" value={prefill.planned} />
          <input type="hidden" name="actualSummary" value={prefill.actual} />
        </div>
      ) : null}
      <Field label={kind === "REFLECTION" ? "How did it go?" : "Note"} htmlFor="entry-text">
        <Textarea id="entry-text" name="text" className="min-h-28" placeholder={kind === "REFLECTION" ? "What did you study? What clicked, what didn’t?" : "Anything you want to remember"} />
        <FieldError name="text" />
      </Field>
      {kind === "REFLECTION" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="What went well? (optional)" htmlFor="entry-ach">
              <Textarea id="entry-ach" name="achievements" className="min-h-16" />
            </Field>
            <Field label="What was difficult? (optional)" htmlFor="entry-diff">
              <Textarea id="entry-diff" name="difficulties" className="min-h-16" />
            </Field>
          </div>
          <TagInput name="topics" label="Topics studied (optional)" suggestions={topicSuggestions} defaultValue={prefill.topics} max={12} />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">Energy (optional)</legend>
            <ChipRadio name="energy" options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: ENERGY_LABELS[v - 1] }))} />
          </fieldset>
        </>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        <PhotoPicker name="photos" />
        <VoiceRecorder name="voice" />
      </div>
      <AiAccessField masterOn={masterOn} />
      <SubmitButton className="self-start">Save entry</SubmitButton>
    </ActionForm>
  );
}

export function EntryEditForm({ id, values, onDone }: { id: string; values: { title: string; text: string; achievements: string; difficulties: string; topics: string[] }; onDone: () => void }) {
  return (
    <ActionForm action={updateEntryAction.bind(null, id)} onSuccess={onDone} className="flex flex-col gap-3">
      <Field label="Title" htmlFor="ed-title">
        <Input id="ed-title" name="title" defaultValue={values.title} maxLength={160} />
      </Field>
      <Field label="Entry" htmlFor="ed-text">
        <Textarea id="ed-text" name="text" defaultValue={values.text} className="min-h-32" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="What went well?" htmlFor="ed-ach">
          <Textarea id="ed-ach" name="achievements" defaultValue={values.achievements} className="min-h-16" />
        </Field>
        <Field label="What was difficult?" htmlFor="ed-diff">
          <Textarea id="ed-diff" name="difficulties" defaultValue={values.difficulties} className="min-h-16" />
        </Field>
      </div>
      <TagInput name="topics" label="Topics" defaultValue={values.topics} max={12} />
      <div className="flex gap-2">
        <SubmitButton size="sm">Save</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}

export function EntryActions({ id, allowed, masterOn, edit }: { id: string; allowed: boolean; masterOn: boolean; edit: { title: string; text: string; achievements: string; difficulties: string; topics: string[] } }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) return <EntryEditForm id={id} values={edit} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 text-sm">
        <Switch
          checked={allowed && masterOn}
          disabled={!masterOn || pending}
          onCheckedChange={(v) =>
            start(async () => {
              await setEntryAiAccessAction(id, v);
              toast.success(v ? "The AI may read this entry" : "AI access removed — anything learned from it was forgotten");
            })
          }
          aria-label="Let the AI read this entry"
        />
        <div>
          <p className="flex items-center gap-1.5 font-medium">
            {allowed && masterOn ? "AI may read this entry" : (
              <>
                <Lock className="size-3.5" aria-hidden /> Private from the AI
              </>
            )}
          </p>
          <p className="text-muted">{masterOn ? "Turning this off deletes memories and suggestions that came from it." : "Journal access is off in Privacy settings."}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this entry, its photos and recording? Memories from it are deleted too.")) start(() => deleteEntryAction(id));
          }}
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

export type SuggestionView = { id: string; title: string; reason: string; origin: string; simulated: boolean; ai: boolean };

export function SuggestionList({ items }: { items: SuggestionView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((s) => (
        <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.title}</p>
            <p className="text-muted">{s.reason}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {s.ai ? <AiLabel simulated={s.simulated} kind="AI suggestion" /> : <Badge>From your study log</Badge>}
              <Badge>{s.origin === "JOURNAL" ? "From your journal" : "Weekly review"}</Badge>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await acceptSuggestionAction(s.id);
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success(r.message ?? "Done");
                    if (r.href) router.push(r.href);
                  }
                })
              }
            >
              <Check /> Do it
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} aria-label={`Dismiss: ${s.title}`} onClick={() => start(() => dismissSuggestionAction(s.id))}>
              <X />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MoodDot({ mood }: { mood: number | null }) {
  const m = MOODS.find((x) => x.value === mood);
  if (!m) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm")} title={`Mood: ${m.label}`}>
      <span aria-hidden>{m.face}</span>
      <span className="sr-only">Mood: </span>
      {m.label}
    </span>
  );
}

export function GenerateReviewButton({ weekKey, exists }: { weekKey: string; exists: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={exists ? "outline" : "primary"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateReviewAction(weekKey);
          (r.ok ? toast.success : toast.error)(r.message ?? (r.ok ? "Done" : "Failed"));
        })
      }
    >
      {pending ? "Reviewing…" : exists ? "Refresh this review" : "Review this week"}
    </Button>
  );
}
