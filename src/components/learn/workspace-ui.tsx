"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BookCheck, Bookmark, BookmarkCheck, Download, Eye, EyeOff, Pencil, RefreshCcw, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  completeRevisionAction,
  createCardAction,
  createQuestionAction,
  deleteCardAction,
  deleteNoteAction,
  discoverResourcesAction,
  draftNoteAction,
  generateCardsAction,
  generatePracticeAction,
  markStudiedAction,
  requestLessonAction,
  resourceFlagAction,
  saveNoteAction,
  scheduleRevisionAction,
  skipRevisionAction,
  addResourceAction,
} from "@/app/(app)/learn/topic-actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { CitedMarkdown } from "./cited-markdown";

function useActionToast() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string } | void>) =>
    start(async () => {
      const r = await fn();
      if (r && r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  return { pending, run };
}

/* ── Lesson & status ──────────────────────────────────────────────── */

export function RequestLessonButton({ topicId, mode, label }: { topicId: string; mode: "SIMPLE" | "STANDARD" | "DEEP" | "EXAM"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} onClick={() => start(() => requestLessonAction(topicId, mode))}>
      <Sparkles /> {label}
    </Button>
  );
}

export function MarkStudied({ topicId, studied }: { topicId: string; studied: boolean }) {
  const [schedule, setSchedule] = useState(true);
  const { pending, run } = useActionToast();
  if (studied)
    return (
      <Badge tone="primary" className="h-8 px-3 text-sm">
        <BookCheck /> Studied
      </Badge>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="soft" disabled={pending} onClick={() => run(() => markStudiedAction(topicId, schedule))}>
        <BookCheck /> Mark as studied
      </Button>
      <Checkbox label="Plan a revision for tomorrow" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
    </div>
  );
}

/* ── Notes ────────────────────────────────────────────────────────── */

export type NoteView = { id: string; title: string; content: string; origin: string; updatedAt: string; staleCards: number; cardCount: number };

export function NoteEditor({ topicId, note, onDone }: { topicId: string; note?: NoteView; onDone?: () => void }) {
  const [preview, setPreview] = useState(false);
  const [content, setContent] = useState(note?.content ?? "");
  return (
    <ActionForm action={saveNoteAction.bind(null, topicId, note?.id ?? null)} onSuccess={onDone} resetOnSuccess={!note} className="flex flex-col gap-3">
      <Field label="Title" htmlFor={`nt-${note?.id ?? "new"}`}>
        <Input id={`nt-${note?.id ?? "new"}`} name="title" defaultValue={note?.title ?? ""} required maxLength={160} />
        <FieldError name="title" />
      </Field>
      <div className="flex items-center justify-between">
        <label htmlFor={`nc-${note?.id ?? "new"}`} className="text-sm font-medium">
          Notes (Markdown and $maths$ supported)
        </label>
        <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
          {preview ? <EyeOff /> : <Eye />} {preview ? "Edit" : "Preview"}
        </Button>
      </div>
      {preview ? (
        <div className="min-h-40 rounded-[10px] border border-border p-3">
          <CitedMarkdown markdown={content || "_Nothing yet_"} />
        </div>
      ) : null}
      <Textarea
        id={`nc-${note?.id ?? "new"}`}
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className={preview ? "hidden" : "min-h-56 font-mono text-[13px]"}
      />
      <div className="flex gap-2">
        <SubmitButton size="sm">Save note</SubmitButton>
        {onDone && note ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}

export function NoteCard({ topicId, note }: { topicId: string; note: NoteView }) {
  const [editing, setEditing] = useState(false);
  const { pending, run } = useActionToast();
  if (editing)
    return (
      <Card className="p-4">
        <NoteEditor topicId={topicId} note={note} onDone={() => setEditing(false)} />
      </Card>
    );
  const download = () => {
    const blob = new Blob([`# ${note.title}\n\n${note.content}\n`], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.replace(/[^\w\- ]+/g, "").trim() || "note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{note.title}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {note.origin === "AI_DRAFT" ? <AiLabel kind="AI draft — not yet edited" /> : note.origin === "MIXED" ? <Badge>Edited AI draft</Badge> : <Badge>Your notes</Badge>}
            {note.cardCount ? <Badge tone="info">{note.cardCount} flashcards</Badge> : null}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Edit note" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Download note as Markdown" onClick={download}>
            <Download />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Delete note" disabled={pending} onClick={() => run(async () => deleteNoteAction(note.id))}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <CitedMarkdown markdown={note.content} />
      </div>
      {note.staleCards ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          You edited this note after {note.staleCards} of its flashcards were made — they may be outdated.
        </p>
      ) : null}
      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => generateCardsAction(note.id))}>
          <RefreshCcw /> {note.cardCount ? "Refresh flashcards from this note" : "Make flashcards from this note"}
        </Button>
      </div>
    </Card>
  );
}

export function DraftNoteButton({ topicId }: { topicId: string }) {
  const { pending, run } = useActionToast();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => draftNoteAction(topicId))}>
      <Sparkles /> Draft notes from the lesson
    </Button>
  );
}

/* ── Flashcards ───────────────────────────────────────────────────── */

export function CardForm({ topicId }: { topicId: string }) {
  return (
    <ActionForm action={createCardAction.bind(null, topicId)} resetOnSuccess className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Front (question)" htmlFor="card-front">
        <Textarea id="card-front" name="front" className="min-h-16" />
      </Field>
      <Field label="Back (answer)" htmlFor="card-back">
        <Textarea id="card-back" name="back" className="min-h-16" />
      </Field>
      <SubmitButton>Add card</SubmitButton>
    </ActionForm>
  );
}

export function DeleteCard({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Delete flashcard" disabled={pending} onClick={() => start(() => deleteCardAction(id))}>
      <Trash2 />
    </Button>
  );
}

/* ── Practice ─────────────────────────────────────────────────────── */

const PRACTICE_MODES = [
  { mode: "QUICK_CHECK", label: "Quick check" },
  { mode: "NUMERICAL", label: "Numericals" },
  { mode: "WRITTEN", label: "Written answers" },
  { mode: "TEACH_BACK", label: "Teach it back" },
  { mode: "EXAM", label: "Exam-style" },
] as const;

export function PracticeGenerator({ topicId, aiAvailable }: { topicId: string; aiAvailable: boolean }) {
  const { pending, run } = useActionToast();
  if (!aiAvailable) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {PRACTICE_MODES.map((m) => (
        <Button key={m.mode} size="sm" variant="outline" disabled={pending} onClick={() => run(() => generatePracticeAction(topicId, m.mode))}>
          <Sparkles /> {m.label}
        </Button>
      ))}
    </div>
  );
}

export function OwnQuestionForm({ topicId }: { topicId: string }) {
  const [type, setType] = useState<"SHORT_ANSWER" | "MCQ" | "NUMERICAL">("SHORT_ANSWER");
  return (
    <ActionForm action={createQuestionAction.bind(null, topicId)} resetOnSuccess className="flex flex-col gap-3">
      <Field label="Type" htmlFor="oq-type">
        <Select id="oq-type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-56">
          <option value="SHORT_ANSWER">Short answer</option>
          <option value="MCQ">Multiple choice</option>
          <option value="NUMERICAL">Numerical</option>
        </Select>
      </Field>
      <Field label="Question" htmlFor="oq-prompt">
        <Textarea id="oq-prompt" name="prompt" className="min-h-16" />
        <FieldError name="prompt" />
      </Field>
      {type === "MCQ" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Input key={i} name="options" placeholder={`Option ${i}`} aria-label={`Option ${i}`} />
          ))}
        </div>
      ) : null}
      <Field label={type === "MCQ" ? "Correct option (type it exactly)" : type === "NUMERICAL" ? "Answer (number)" : "Answer"} htmlFor="oq-answer">
        <Input id="oq-answer" name="answer" />
        <FieldError name="answer" />
      </Field>
      <Field label="Explanation (optional)" htmlFor="oq-exp">
        <Textarea id="oq-exp" name="explanation" className="min-h-16" />
      </Field>
      <SubmitButton size="sm" className="self-start">
        Add question
      </SubmitButton>
    </ActionForm>
  );
}

/* ── Revision ─────────────────────────────────────────────────────── */

export function ScheduleRevisionForm({ topicId, defaultDate, defaultTime }: { topicId: string; defaultDate: string; defaultTime: string }) {
  return (
    <ActionForm action={scheduleRevisionAction.bind(null, topicId)} className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_auto_auto_auto] sm:items-end">
      <Field label="Date" htmlFor="rv-date">
        <Input id="rv-date" name="date" type="date" defaultValue={defaultDate} required />
      </Field>
      <Field label="Time" htmlFor="rv-time">
        <Input id="rv-time" name="time" type="time" defaultValue={defaultTime} required />
      </Field>
      <Field label="Minutes" htmlFor="rv-min">
        <Input id="rv-min" name="minutes" type="number" min={5} max={120} defaultValue={20} className="w-24" />
      </Field>
      <SubmitButton>Schedule revision</SubmitButton>
    </ActionForm>
  );
}

export function CompleteRevision({ taskId }: { taskId: string }) {
  const [recall, setRecall] = useState(70);
  const { pending, run } = useActionToast();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`recall-${taskId}`} className="text-sm">
        How much did you remember without looking? <strong>{recall}%</strong>
      </label>
      <input id={`recall-${taskId}`} type="range" min={0} max={100} step={10} value={recall} onChange={(e) => setRecall(Number(e.target.value))} className="w-full max-w-sm accent-[var(--primary)]" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => completeRevisionAction(taskId, recall))}>
          Done — schedule the next one
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(async () => skipRevisionAction(taskId))}>
          Skip
        </Button>
      </div>
      <p className="text-xs text-muted">Lower recall brings the next revision sooner; strong recall spaces it out.</p>
    </div>
  );
}

/* ── Resources ────────────────────────────────────────────────────── */

export function FindResourcesButton({ topicId }: { topicId: string }) {
  const { pending, run } = useActionToast();
  return (
    <Button className="self-start" disabled={pending} onClick={() => run(() => discoverResourcesAction(topicId))}>
      <Search /> {pending ? "Searching…" : "Find resources on the web"}
    </Button>
  );
}

export function ResourceFlags({ id, saved }: { id: string; saved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={saved ? "Unsave resource" : "Save resource"} disabled={pending} onClick={() => start(() => resourceFlagAction(id, { saved: !saved }))}>
        {saved ? <BookmarkCheck /> : <Bookmark />}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss resource" disabled={pending} onClick={() => start(() => resourceFlagAction(id, { dismissed: true }))}>
        <X />
      </Button>
    </div>
  );
}

export function AddResourceForm({ topicId, subjectId }: { topicId: string | null; subjectId: string | null }) {
  return (
    <ActionForm action={addResourceAction.bind(null, topicId, subjectId)} resetOnSuccess className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-end">
      <Field label="Link" htmlFor="res-url">
        <Input id="res-url" name="url" type="url" placeholder="https://" required />
        <FieldError name="url" />
      </Field>
      <Field label="Title" htmlFor="res-title">
        <Input id="res-title" name="title" />
      </Field>
      <Field label="Cost" htmlFor="res-cost">
        <Select id="res-cost" name="cost" defaultValue="FREE">
          <option value="FREE">Free</option>
          <option value="FREEMIUM">Free + paid parts</option>
          <option value="PAID">Paid</option>
          <option value="UNKNOWN">Not sure</option>
        </Select>
      </Field>
      <SubmitButton>Save link</SubmitButton>
    </ActionForm>
  );
}

/** Starts the standard lesson the first time a topic is opened (only on a real visit, never on prefetch). */
export function AutoRequestLesson({ topicId }: { topicId: string }) {
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === topicId) return;
    started.current = topicId;
    void requestLessonAction(topicId, "STANDARD");
  }, [topicId]);
  return <p className="text-sm text-muted">Preparing your lesson…</p>;
}
