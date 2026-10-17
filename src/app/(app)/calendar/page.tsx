import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Download, LifeBuoy, RefreshCw, Wand2 } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { countdowns, listAgenda } from "@/server/services/calendar";
import { getConnection } from "@/server/services/calendar-sync";
import { addDaysToKey, formatInTz, localDateKey, weekStartKey, zonedToUtc } from "@/lib/time";
import { AddEventButton, CalendarView, QuickAdd, type DayColumn } from "@/components/calendar/calendar-view";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { toCalItems } from "./view-model";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [profile, at] = await Promise.all([getProfile(user.id), now(user.id)]);
  const tz = profile.timezone;
  const todayKey = localDateKey(at, tz);
  const focusKey = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayKey;
  const startKey = weekStartKey(focusKey);
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(startKey, i));
  const from = zonedToUtc(startKey, "00:00", tz);
  const to = zonedToUtc(addDaysToKey(startKey, 7), "00:00", tz);
  const [agenda, upcoming, connection] = await Promise.all([listAgenda(user.id, from, to, { tz }), countdowns(user.id, at), getConnection(user.id)]);
  const items = toCalItems(agenda, dayKeys, tz);
  const timedMins = items.filter((i) => !i.allDay && !i.isDeadline && i.kind !== "COMMITMENT").flatMap((i) => [i.startMin, i.endMin]);
  const startHour = Math.min(6, ...timedMins.map((m) => Math.floor(m / 60)));
  const endHour = Math.max(23, ...timedMins.map((m) => Math.ceil(m / 60)));
  const days: DayColumn[] = dayKeys.map((k) => {
    const d = zonedToUtc(k, "12:00", tz);
    return { key: k, label: formatInTz(d, tz, { weekday: "short", day: "numeric", month: "short" }), short: formatInTz(d, tz, { weekday: "narrow" }), isToday: k === todayKey };
  });
  const rangeLabel = `${formatInTz(from, tz, { day: "numeric", month: "short" })} – ${formatInTz(zonedToUtc(dayKeys[6], "12:00", tz), tz, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Calendar"
        description="Classes, deadlines, exams, revision and study sessions in one place. Times are in your time zone."
        actions={
          <>
            <Link href="/calendar/plan" className={buttonVariants({ size: "sm" })}>
              <Wand2 /> Plan my week
            </Link>
            <Link href="/calendar/restart" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <LifeBuoy /> Fresh start
            </Link>
            <Link href="/calendar/sync" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <RefreshCw /> Google Calendar
              {connection ? <Badge tone="success">On</Badge> : null}
            </Link>
          </>
        }
      />

      {upcoming.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Countdowns">
          {upcoming.map((c) => (
            <Link key={c.key} href={c.href} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm", c.kind === "EXAM" ? "border-danger/30 bg-danger-soft text-danger" : "border-accent/40 bg-accent-soft text-accent-soft-fg")}>
              <CalendarClock className="size-4" aria-hidden />
              <span className="font-medium">{c.title}</span>
              <span>{c.daysLeft === 0 ? "today" : c.daysLeft === 1 ? "tomorrow" : `in ${c.daysLeft} days`}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <QuickAdd timezone={tz} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`/calendar?date=${addDaysToKey(startKey, -7)}`} className={buttonVariants({ size: "icon-sm", variant: "ghost" })} aria-label="Previous week">
            <ChevronLeft />
          </Link>
          <Link href="/calendar" className={buttonVariants({ size: "sm", variant: "outline" })}>
            This week
          </Link>
          <Link href={`/calendar?date=${addDaysToKey(startKey, 7)}`} className={buttonVariants({ size: "icon-sm", variant: "ghost" })} aria-label="Next week">
            <ChevronRight />
          </Link>
          <h2 className="ml-2 text-sm font-semibold sm:text-base">{rangeLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <AddEventButton date={focusKey < todayKey ? todayKey : focusKey} timezone={tz} />
          <a href="/api/calendar/ics" className={buttonVariants({ size: "sm", variant: "ghost" })} title="Download as .ics for any calendar app">
            <Download /> .ics
          </a>
        </div>
      </div>

      <CalendarView days={days} items={items} startHour={startHour} endHour={endHour} timezone={tz} todayKey={todayKey} />
      <p className="text-xs text-muted">
        Dashed blocks are your regular classes and commitments (edit them in Settings). Striped blocks are busy times from Google Calendar — Kadam sees only that you’re busy, not what it is.
      </p>
    </div>
  );
}
