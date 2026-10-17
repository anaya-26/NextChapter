"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Layers, Play, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addOwnMistakeAction, addPastedMaterialAction, deleteMaterialAction, mistakeAction, retrySourceAction, reviewCardAction } from "@/app/(app)/learn/topic-actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatTimestamp } from "@/lib/captions";
import { cn } from "@/lib/utils";
import { CitedMarkdown } from "./cited-markdown";

/* ── Materials ────────────────────────────────────────────────────── */

export function MaterialActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      {canRetry ? (
        <Button size="icon-sm" variant="ghost" aria-label="Process again" disabled={pending} onClick={() => start(() => retrySourceAction(id))}>
          <RefreshCcw />
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete material"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this file and its extracted text? Lessons that cited it keep their text but lose the link.")) start(() => deleteMaterialAction(id));
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function PasteMaterialForm({ subjectId }: { subjectId: string }) {
  return (
    <ActionForm action={addPastedMaterialAction.bind(null, subjectId)} resetOnSuccess className="flex flex-col gap-3">
      <Field label="Title" htmlFor="paste-title">
        <Input id="paste-title" name="title" placeholder="e.g. Class notes — 12 Aug" maxLength={120} />
      </Field>
      <Field label="Text" htmlFor="paste-text">
        <Textarea id="paste-text" name="text" className="min-h-32" placeholder="Paste notes, a chapter summary or a transcript…" />
        <FieldError name="text" />
      </Field>
      <SubmitButton size="sm" className="self-start">
        Add text
      </SubmitButton>
    </ActionForm>
  );
}

/** Polls by refreshing the page while some materials are still processing. */
export function RefreshWhileProcessing({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}

/* ── Source viewer ────────────────────────────────────────────────── */

export type ChunkView = { id: string; text: string; page: number | null; startSec: number | null; endSec: number | null; heading: string | null };

export function SourceViewer({
  media,
  chunks,
  targetId,
  startAt,
}: {
  media: { url: string; kind: "AUDIO" | "VIDEO"; mime: string } | null;
  chunks: ChunkView[];
  targetId: string | null;
  startAt: number | null;
}) {
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [active, setActive] = useState<string | null>(targetId);

  useEffect(() => {
    if (targetId) document.getElementById(`chunk-${targetId}`)?.scrollIntoView({ block: "center" });
  }, [targetId]);

  useEffect(() => {
    const el = player.current;
    if (!el || startAt == null) return;
    const seek = () => {
      el.currentTime = startAt;
    };
    if (el.readyState >= 1) seek();
    else el.addEventListener("loadedmetadata", seek, { once: true });
  }, [startAt]);

  const seekTo = (c: ChunkView) => {
    setActive(c.id);
    const el = player.current;
    if (el && c.startSec != null) {
      el.currentTime = c.startSec;
      void el.play().catch(() => {});
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {media ? (
        <div className="sticky top-16 z-10 rounded-xl bg-bg/95 py-2 backdrop-blur">
          {media.kind === "VIDEO" ? (
            <video ref={player} controls preload="metadata" className="max-h-[50vh] w-full rounded-xl bg-black">
              <source src={media.url} type={media.mime} />
            </video>
          ) : (
            <audio ref={player} controls preload="metadata" className="w-full">
              <source src={media.url} type={media.mime} />
            </audio>
          )}
        </div>
      ) : null}
      {chunks.length ? (
        <ol className="flex flex-col gap-2">
          {chunks.map((c, i) => {
            const pageBreak = c.page != null && (i === 0 || chunks[i - 1].page !== c.page);
            return (
              <li key={c.id} id={`chunk-${c.id}`} className="scroll-mt-24">
                {pageBreak ? <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Page {c.page}</p> : null}
                <div className={cn("rounded-lg border p-3 text-sm transition-colors", active === c.id ? "border-accent bg-accent-soft/50" : "border-border")}>
                  {c.startSec != null ? (
                    <button type="button" onClick={() => seekTo(c)} className="mb-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary hover:bg-primary-soft" disabled={!media}>
                      <Play className="size-3" aria-hidden /> {formatTimestamp(c.startSec)}
                      {c.endSec != null ? `–${formatTimestamp(c.endSec)}` : ""}
                    </button>
                  ) : null}
                  {c.heading ? <p className="font-medium">{c.heading}</p> : null}
                  <p className="whitespace-pre-line">{c.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/* ── Flashcard review ─────────────────────────────────────────────── */

export type ReviewCardView = {
  id: string;
  front: string;
  back: string;
  topic: { title: string; href: string } | null;
  origin: string;
  stale: boolean;
  intervals: { again: string; hard: string; good: string; easy: string };
};

const RATINGS = [
  { rating: 1, key: "again", label: "Again", tone: "border-danger/40 text-danger" },
  { rating: 2, key: "hard", label: "Hard", tone: "border-warning/40 text-warning" },
  { rating: 3, key: "good", label: "Good", tone: "border-primary/40 text-primary" },
  { rating: 4, key: "easy", label: "Easy", tone: "border-success/40 text-success" },
] as const;

export function ReviewSession({ cards }: { cards: ReviewCardView[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState(0);
  const [pending, start] = useTransition();
  const card = cards[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || pending || (e.target as HTMLElement)?.closest("input, textarea")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function rate(rating: 1 | 2 | 3 | 4) {
    if (!card) return;
    start(async () => {
      try {
        await reviewCardAction(card.id, rating);
        if (rating === 1) setAgain((a) => a + 1);
        setShown(false);
        setIndex((i) => i + 1);
      } catch {
        toast.error("Couldn't save that review — check your connection.");
      }
    });
  }

  if (!card)
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <p className="text-lg font-semibold">Review done — {cards.length} card{cards.length === 1 ? "" : "s"}</p>
        {again ? <p className="text-sm text-muted">{again} marked “Again” will come back shortly.</p> : null}
        <Button variant="outline" onClick={() => router.refresh()}>
          <RotateCcw /> Check for more due cards
        </Button>
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        {card.topic ? (
          <a href={card.topic.href} className="truncate hover:text-fg hover:underline">
            {card.topic.title}
          </a>
        ) : null}
      </div>
      <Card className="flex min-h-64 flex-col gap-4 p-5 sm:p-8">
        <div className="text-lg">
          <CitedMarkdown markdown={card.front} />
        </div>
        {shown ? (
          <div className="border-t border-dashed border-border pt-4">
            <CitedMarkdown markdown={card.back} />
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-1.5">
          {card.origin === "AI" || card.origin === "MOCK" ? <Badge tone={card.origin === "MOCK" ? "warning" : "info"}>{card.origin === "MOCK" ? "Simulated AI card" : "AI card from your note"}</Badge> : null}
          {card.origin === "MISTAKE" ? <Badge tone="accent">From your mistake library</Badge> : null}
          {card.stale ? <Badge tone="warning">Its note was edited since — check the card is still right</Badge> : null}
        </div>
      </Card>
      {!shown ? (
        <Button size="lg" onClick={() => setShown(true)} className="w-full sm:w-auto sm:self-center">
          <Eye /> Show answer
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="How well did you remember?">
          {RATINGS.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={pending}
              onClick={() => rate(r.rating)}
              className={cn("flex flex-col items-center rounded-xl border-2 bg-surface px-3 py-2.5 font-medium hover:bg-surface-2 disabled:opacity-60", r.tone)}
            >
              {r.label}
              <span className="text-xs font-normal text-muted">{card.intervals[r.key]}</span>
            </button>
          ))}
        </div>
      )}
      <p className="hidden text-center text-xs text-muted sm:block">Keyboard: Space to show · 1–4 to rate</p>
    </div>
  );
}

/* ── Mistakes ─────────────────────────────────────────────────────── */

export function MistakeActions({ id, resolved, hasCard }: { id: string; resolved: boolean; hasCard: boolean }) {
  const [pending, start] = useTransition();
  const run = (op: "review" | "resolve" | "card" | "delete", message: string) =>
    start(async () => {
      await mistakeAction(id, op);
      toast.success(message);
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      {!resolved ? (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run("review", "Marked as revisited")}>
            <RotateCcw /> I revisited this
          </Button>
          <Button size="sm" variant="soft" disabled={pending} onClick={() => run("resolve", "Resolved — well done")}>
            <CheckCircle2 /> I’ve got it now
          </Button>
        </>
      ) : null}
      {!hasCard ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("card", "Flashcard made")}>
          <Layers /> Make a flashcard
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete mistake"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this mistake from your library?")) run("delete", "Deleted");
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function AddMistakeForm({ topics, defaultTopicId }: { topics: { id: string; label: string }[]; defaultTopicId?: string }) {
  return (
    <ActionForm action={addOwnMistakeAction} resetOnSuccess className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What was it?" htmlFor="mk-title">
          <Input id="mk-title" name="title" placeholder="e.g. Sign of work done by friction" maxLength={160} />
        </Field>
        <Field label="Topic" htmlFor="mk-topic">
          <Select id="mk-topic" name="topicId" defaultValue={defaultTopicId ?? ""}>
            <option value="">No specific topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What went wrong?" htmlFor="mk-wrong">
        <Textarea id="mk-wrong" name="whatWentWrong" className="min-h-16" />
      </Field>
      <Field label="The right approach (optional)" htmlFor="mk-right">
        <Textarea id="mk-right" name="correctApproach" className="min-h-16" />
      </Field>
      <SubmitButton size="sm" className="self-start">
        Add to library
      </SubmitButton>
    </ActionForm>
  );
}
