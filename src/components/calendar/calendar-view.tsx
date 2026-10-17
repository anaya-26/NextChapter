"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, Clock, MapPin, Play, Plus, Repeat, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEventAction, draftEventAction, setEventStatusAction, startSessionAction } from "@/app/(app)/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel, DemoBadge } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { EventForm, emptyEventValues } from "./event-form";
import { KIND_META, type CalItem, type EventFormValues } from "./kinds";

export type DayColumn = { key: string; label: string; short: string; isToday: boolean };

const PX_PER_MIN = 0.8;

function ItemChip({ item, onOpen, compact }: { item: CalItem; onOpen: (i: CalItem) => void; compact?: boolean }) {
  const meta = KIND_META[item.kind] ?? KIND_META.PERSONAL;
  const done = item.status === "DONE" || item.sessionStatus === "COMPLETED";
  const missed = item.sessionStatus === "MISSED";
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs leading-tight shadow-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-focus",
        meta.chip,
        (done || missed) && "opacity-60",
      )}
      title={`${item.title} · ${item.timeLabel}`}
    >
      <span className={cn("truncate font-medium", missed && "line-through")}>{item.title}</span>
      {!compact ? <span className="truncate opacity-80">{item.timeLabel}</span> : null}
    </button>
  );
}

export function CalendarView({ days, items, startHour, endHour, timezone, todayKey }: { days: DayColumn[]; items: CalItem[]; startHour: number; endHour: number; timezone: string; todayKey: string }) {
  const [open, setOpen] = useState<CalItem | null>(null);
  const [editing, setEditing] = useState(false);
  const timed = items.filter((i) => !i.allDay && !i.isDeadline);
  const allDay = items.filter((i) => i.allDay || i.isDeadline);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * 60 * PX_PER_MIN;
  const show = (i: CalItem) => {
    setEditing(false);
    setOpen(i);
  };

  return (
    <>
      {/* Week grid (tablet and desktop) */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface md:block">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-border" />
          {days.map((d) => (
            <div key={d.key} className={cn("border-b border-l border-border px-2 py-2 text-center text-sm", d.isToday && "bg-primary-soft/50")}>
              <span className={cn("font-medium", d.isToday && "text-primary")}>{d.label}</span>
            </div>
          ))}
          <div className="border-b border-border px-1 py-1 text-right text-[11px] text-muted">All day</div>
          {days.map((d) => (
            <div key={d.key} className="flex min-h-9 flex-col gap-1 border-b border-l border-border p-1">
              {allDay
                .filter((i) => i.dateKey === d.key)
                .map((i) => (
                  <div key={i.key} className="h-7">
                    <ItemChip item={i} onOpen={show} compact />
                  </div>
                ))}
            </div>
          ))}
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted" style={{ top: (h - startHour) * 60 * PX_PER_MIN }}>
                {h === 0 ? "" : `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.key} className={cn("relative border-l border-border", d.isToday && "bg-primary-soft/20")} style={{ height: gridHeight }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - startHour) * 60 * PX_PER_MIN }} />
              ))}
              {timed
                .filter((i) => i.dateKey === d.key)
                .map((i) => {
                  const top = (Math.max(i.startMin, startHour * 60) - startHour * 60) * PX_PER_MIN;
                  const height = Math.max(22, (Math.min(i.endMin, endHour * 60) - Math.max(i.startMin, startHour * 60)) * PX_PER_MIN - 2);
                  const width = 100 / i.lanes;
                  return (
                    <div key={i.key} className="absolute p-px" style={{ top, height, left: `${i.lane * width}%`, width: `${width}%` }}>
                      <ItemChip item={i} onOpen={show} compact={height < 34} />
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* Agenda (phones) */}
      <div className="flex flex-col gap-3 md:hidden">
        {days.map((d) => {
          const dayItems = items.filter((i) => i.dateKey === d.key && i.kind !== "COMMITMENT");
          const commitments = items.filter((i) => i.dateKey === d.key && i.kind === "COMMITMENT");
          if (d.key < todayKey && !dayItems.length) return null;
          return (
            <section key={d.key} aria-label={d.label}>
              <h2 className={cn("mb-1.5 flex items-center gap-2 text-sm font-semibold", d.isToday && "text-primary")}>
                {d.label} {d.isToday ? <Badge tone="primary">Today</Badge> : null}
              </h2>
              {dayItems.length ? (
                <Card className="divide-y divide-border">
                  {dayItems.map((i) => (
                    <button key={i.key} type="button" onClick={() => show(i)} className="flex w-full items-start gap-3 p-3 text-left">
                      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", (KIND_META[i.kind] ?? KIND_META.PERSONAL).dot)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate font-medium", i.sessionStatus === "MISSED" && "text-muted line-through")}>{i.title}</span>
                        <span className="block text-xs text-muted">
                          {i.timeLabel} · {(KIND_META[i.kind] ?? KIND_META.PERSONAL).label}
                        </span>
                      </span>
                      {i.status === "DONE" || i.sessionStatus === "COMPLETED" ? <CalendarCheck2 className="size-4 text-success" aria-label="Done" /> : null}
                    </button>
                  ))}
                </Card>
              ) : (
                <p className="text-sm text-muted">Nothing planned.</p>
              )}
              {commitments.length ? <p className="mt-1 text-xs text-muted">Also: {commitments.map((c) => `${c.title} ${c.timeLabel}`).join(" · ")}</p> : null}
            </section>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open ? (
          <DialogContent title={editing ? "Edit" : open.title} description={editing ? undefined : open.whenLabel}>
            {editing && open.edit && open.eventId ? (
              <EventForm eventId={open.eventId} values={open.edit} timezone={timezone} onDone={() => setOpen(null)} />
            ) : (
              <EventDetails item={open} todayKey={todayKey} onEdit={() => setEditing(true)} onClose={() => setOpen(null)} />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function EventDetails({ item, onEdit, onClose }: { item: CalItem; todayKey: string; onEdit: () => void; onClose: () => void }) {
  const [pending, start] = useTransition();
  const meta = KIND_META[item.kind] ?? KIND_META.PERSONAL;
  const source =
    item.source === "PLANNER" ? "Planned by Kadam" : item.source === "GOOGLE" ? "Added in Google Calendar" : item.source === "COMMITMENT" ? "From your classes & commitments" : item.source === "BUSY" ? "Busy time from your Google Calendar (Kadam can’t see what it is)" : "Added by you";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge className={meta.chip}>{meta.label}</Badge>
        {item.isDemo ? <DemoBadge /> : null}
        {item.syncState === "SYNCED" ? <Badge tone="success">In Google Calendar</Badge> : item.syncState === "PENDING_PUSH" ? <Badge tone="info">Google: waiting for your approval</Badge> : item.syncState === "CONFLICT" ? <Badge tone="warning">Google: conflict to resolve</Badge> : null}
        {item.sessionStatus === "MISSED" ? <Badge tone="warning">Missed</Badge> : null}
        {item.status === "DONE" || item.sessionStatus === "COMPLETED" ? <Badge tone="success">Done</Badge> : null}
      </div>
      <p className="text-muted">{source}</p>
      {item.ruleText ? (
        <p className="flex items-center gap-1.5">
          <Repeat className="size-4 text-muted" aria-hidden /> {item.ruleText}
        </p>
      ) : null}
      {item.location ? (
        <p className="flex items-center gap-1.5">
          <MapPin className="size-4 text-muted" aria-hidden /> {item.location}
        </p>
      ) : null}
      {item.description ? <p className="whitespace-pre-line">{item.description}</p> : null}
      {item.topicHref ? (
        <Link href={item.topicHref} className="font-medium text-primary hover:underline">
          Open topic: {item.topicTitle}
        </Link>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {item.sessionId && item.sessionStatus === "PLANNED" ? (
          <Button size="sm" disabled={pending} onClick={() => start(() => startSessionAction(item.sessionId!))}>
            <Play /> Start session
          </Button>
        ) : null}
        {item.sessionId && item.sessionStatus === "IN_PROGRESS" ? (
          <Link href={`/study/${item.sessionId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg">
            <Clock className="size-4" aria-hidden /> Continue session
          </Link>
        ) : null}
        {item.eventId && !item.sessionId && item.status !== "DONE" && item.kind !== "COMMITMENT" ? (
          <Button
            size="sm"
            variant="soft"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setEventStatusAction(item.eventId!, "DONE");
                toast.success("Marked done");
                onClose();
              })
            }
          >
            <CalendarCheck2 /> Mark done
          </Button>
        ) : null}
        {item.edit && item.eventId ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {item.source === "COMMITMENT" ? (
          <Link href="/settings#commitments" className="text-sm font-medium text-primary hover:underline">
            Edit classes & commitments
          </Link>
        ) : null}
        {item.eventId ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(item.ruleText ? "Delete every occurrence of this event?" : "Delete this event?")) return;
              start(async () => {
                await deleteEventAction(item.eventId!);
                toast.success("Deleted");
                onClose();
              });
            }}
          >
            <Trash2 /> Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function AddEventButton({ date, timezone, label = "Add event" }: { date: string; timezone: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      {open ? (
        <DialogContent title="Add to calendar">
          <EventForm eventId={null} values={emptyEventValues(date)} timezone={timezone} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

type DraftResult = Awaited<ReturnType<typeof draftEventAction>>;

/** Type a sentence ("Chemistry test on 23/10 at 10am"); review the draft; then save. */
export function QuickAdd({ timezone }: { timezone: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [pending, start] = useTransition();
  const [round, setRound] = useState(0);
  const read = () =>
    start(async () => {
      setResult(await draftEventAction(text));
      setRound((r) => r + 1);
    });
  const draft = result && "draft" in result ? result : null;
  const values: EventFormValues | null = draft
    ? {
        title: draft.draft.title,
        kind: draft.draft.kind,
        date: draft.draft.dateKey,
        start: draft.draft.startTime ?? "18:00",
        duration: draft.draft.durationMinutes,
        allDay: draft.draft.allDay,
        repeat: draft.draft.recurrence ? draft.draft.recurrence.freq : "NONE",
        days: draft.draft.recurrence?.days ?? [],
        until: draft.draft.recurrence?.untilKey ?? "",
        reminder: draft.draft.reminderMinutes.join(","),
        countdown: draft.draft.showCountdown,
        deadline: draft.draft.isDeadline,
        estimate: null,
        location: "",
        description: "",
        topicId: null,
      }
    : null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          read();
        }}
      >
        <label htmlFor="quick-add" className="sr-only">
          Add by typing
        </label>
        <Input id="quick-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try: “Chemistry test on 23/10 at 10am” or “coaching every Mon and Wed 5–7pm”" className="flex-1" />
        <Button type="submit" variant="soft" disabled={pending || !text.trim()}>
          <Wand2 /> {pending ? "Reading…" : "Read it"}
        </Button>
      </form>
      {result && "error" in result ? <p className="text-sm text-danger">{result.error}</p> : null}
      {draft && values ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {draft.method === "RULES" ? (
              <Badge tone="info">
                <Sparkles /> Read with simple rules — please check
              </Badge>
            ) : (
              <AiLabel simulated={draft.method === "MOCK"} kind="Read by AI — please check" />
            )}
            <span className="text-muted">Nothing is saved until you press “Add to calendar”.</span>
          </div>
          {draft.draft.assumptions.length ? (
            <ul className="list-disc pl-5 text-sm text-muted">
              {draft.draft.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          <EventForm
            key={round}
            eventId={null}
            values={values}
            timezone={timezone}
            onDone={() => {
              setResult(null);
              setText("");
            }}
          />
        </div>
      ) : null}
    </Card>
  );
}
