"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { checkConflictsAction, saveEventAction } from "@/app/(app)/calendar/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { DayPicker } from "@/components/forms/inputs";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { EVENT_KINDS, KIND_META, REMINDER_OPTIONS, type EventFormValues } from "./kinds";

type Clash = { title: string; start: string; end: string; kind: string };

const DEFAULT_DURATION: Record<string, number> = { CLASS: 60, EXAM: 180, ASSIGNMENT: 15, APPLICATION: 15, REVISION: 30, STUDY: 45, FOCUS: 25, PROJECT: 60, PERSONAL: 60, REMINDER: 15 };

export function emptyEventValues(date: string, start = "18:00"): EventFormValues {
  return { title: "", kind: "STUDY", date, start, duration: 45, allDay: false, repeat: "NONE", days: [], until: "", reminder: "10", countdown: false, deadline: false, estimate: null, location: "", description: "", topicId: null };
}

export function EventForm({ eventId, values, timezone, onDone }: { eventId: string | null; values: EventFormValues; timezone: string; onDone?: () => void }) {
  const [kind, setKind] = useState(values.kind);
  const [allDay, setAllDay] = useState(values.allDay);
  const [repeat, setRepeat] = useState(values.repeat);
  const [date, setDate] = useState(values.date);
  const [start, setStart] = useState(values.start);
  const [duration, setDuration] = useState(values.duration);
  const [deadline, setDeadline] = useState(values.deadline);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const id = eventId ?? "new";
  const reminderOptions = REMINDER_OPTIONS.some((o) => o.value === values.reminder) ? REMINDER_OPTIONS : [...REMINDER_OPTIONS, { value: values.reminder, label: `${values.reminder} minutes before` }];

  useEffect(() => {
    if (allDay || deadline || !start || !date) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await checkConflictsAction({ date, start, duration, excludeId: eventId });
      if (!cancelled) setClashes(r);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [date, start, duration, allDay, deadline, eventId]);

  const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const visibleClashes = allDay || deadline ? [] : clashes;

  return (
    <ActionForm action={saveEventAction.bind(null, eventId)} onSuccess={onDone} className="flex flex-col gap-3">
      <Field label="Title" htmlFor={`ev-title-${id}`}>
        <Input id={`ev-title-${id}`} name="title" defaultValue={values.title} required maxLength={160} />
        <FieldError name="title" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor={`ev-kind-${id}`}>
          <Select
            id={`ev-kind-${id}`}
            name="kind"
            value={kind}
            onChange={(e) => {
              const k = e.target.value;
              setKind(k);
              if (!eventId) {
                setDuration(DEFAULT_DURATION[k] ?? 45);
                setDeadline(k === "ASSIGNMENT" || k === "APPLICATION");
              }
            }}
          >
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor={`ev-date-${id}`}>
          <Input id={`ev-date-${id}`} name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <FieldError name="date" />
        </Field>
      </div>
      <Checkbox label="All day" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      {!allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={deadline ? "Due at" : "Starts"} htmlFor={`ev-start-${id}`}>
            <Input id={`ev-start-${id}`} name="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <FieldError name="start" />
          </Field>
          <Field label="Length (minutes)" htmlFor={`ev-dur-${id}`}>
            <Input id={`ev-dur-${id}`} name="duration" type="number" min={5} max={1440} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            <FieldError name="duration" />
          </Field>
        </div>
      ) : (
        <input type="hidden" name="duration" value={Math.max(1440, duration)} />
      )}
      {visibleClashes.length ? (
        <div className="flex gap-2 rounded-lg bg-warning-soft p-2.5 text-sm text-warning" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            Clashes with {visibleClashes.map((c) => `${c.title} (${fmt(c.start)}–${fmt(c.end)})`).join(", ")}. You can still save it.
          </div>
        </div>
      ) : null}
      <Checkbox label="This is a deadline (e.g. a submission) — it doesn't block study time" name="deadline" checked={deadline} onChange={(e) => setDeadline(e.target.checked)} />
      {deadline || kind === "PROJECT" ? (
        <Field label="How long will the work take? (minutes, for planning)" htmlFor={`ev-est-${id}`} hint="The planner books time before the deadline. Leave blank to assume an hour.">
          <Input id={`ev-est-${id}`} name="estimate" type="number" min={0} step={15} defaultValue={values.estimate ?? ""} className="w-40" />
        </Field>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Repeats" htmlFor={`ev-repeat-${id}`}>
          <Select id={`ev-repeat-${id}`} name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
            <option value="NONE">Doesn’t repeat</option>
            <option value="DAILY">Every day</option>
            <option value="WEEKLY">Weekly on…</option>
          </Select>
        </Field>
        {repeat !== "NONE" ? (
          <Field label="Until (optional)" htmlFor={`ev-until-${id}`}>
            <Input id={`ev-until-${id}`} name="until" type="date" defaultValue={values.until} />
          </Field>
        ) : (
          <input type="hidden" name="until" value="" />
        )}
      </div>
      {repeat === "WEEKLY" ? (
        <div>
          <DayPicker name="days" defaultValue={values.days} />
          <FieldError name="days" />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reminder" htmlFor={`ev-rem-${id}`}>
          <Select id={`ev-rem-${id}`} name="reminder" defaultValue={values.reminder}>
            {reminderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Place (optional)" htmlFor={`ev-loc-${id}`}>
          <Input id={`ev-loc-${id}`} name="location" defaultValue={values.location} maxLength={200} />
        </Field>
      </div>
      <Checkbox label="Show a countdown on Today" name="countdown" defaultChecked={values.countdown} />
      <Field label="Notes (optional)" htmlFor={`ev-notes-${id}`}>
        <Textarea id={`ev-notes-${id}`} name="description" defaultValue={values.description} className="min-h-16" />
      </Field>
      {values.topicId ? <input type="hidden" name="topicId" value={values.topicId} /> : null}
      <p className="text-xs text-muted">Times are in {timezone.replace("_", " ")}.</p>
      <SubmitButton className="self-start">{eventId ? "Save changes" : "Add to calendar"}</SubmitButton>
    </ActionForm>
  );
}
