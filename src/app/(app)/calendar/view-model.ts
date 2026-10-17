import "server-only";
import type { AgendaItem } from "@/server/services/calendar";
import { describeRule, ruleDays, ruleUntilKey } from "@/lib/recurrence";
import { addDaysToKey, formatInTz, localDateKey, localTimeKey, parseHm, zonedToUtc } from "@/lib/time";
import type { CalItem, EventFormValues } from "@/components/calendar/kinds";

function timeLabel(start: Date, end: Date, tz: string, allDay: boolean, isDeadline: boolean) {
  if (allDay) return "All day";
  const t = (d: Date) => formatInTz(d, tz, { hour: "numeric", minute: "2-digit" });
  return isDeadline ? `Due ${t(start)}` : `${t(start)}–${t(end)}`;
}

function editValues(i: AgendaItem, tz: string): EventFormValues | null {
  if (!i.eventId) return null;
  const freq = /FREQ=(DAILY|WEEKLY)/.exec(i.rrule ?? "")?.[1] as "DAILY" | "WEEKLY" | undefined;
  return {
    title: i.title,
    kind: i.kind,
    date: localDateKey(i.start, tz),
    start: localTimeKey(i.start, tz),
    duration: Math.round((i.end.getTime() - i.start.getTime()) / 60000),
    allDay: i.allDay,
    repeat: freq ?? "NONE",
    days: ruleDays(i.rrule),
    until: ruleUntilKey(i.rrule) ?? "",
    reminder: i.reminderMinutes.join(","),
    countdown: i.showCountdown,
    deadline: i.isDeadline,
    estimate: i.estimatedMinutes,
    location: i.location ?? "",
    description: i.description ?? "",
    topicId: i.topic?.id ?? null,
  };
}

/** Splits agenda items into per-day segments with overlap lanes for the week grid. */
export function toCalItems(agenda: AgendaItem[], dayKeys: string[], tz: string): CalItem[] {
  const out: CalItem[] = [];
  for (const i of agenda) {
    const base = {
      eventId: i.eventId,
      title: i.title,
      kind: i.kind,
      commitmentKind: i.commitmentKind,
      allDay: i.allDay,
      isDeadline: i.isDeadline,
      status: i.status,
      source: i.source,
      ruleText: describeRule(i.rrule),
      topicHref: i.topic ? `/learn/${i.topic.subjectId}/topics/${i.topic.id}` : null,
      topicTitle: i.topic?.title ?? null,
      sessionId: i.session?.id ?? null,
      sessionStatus: i.session?.status ?? null,
      location: i.location,
      description: i.description,
      isDemo: i.isDemo,
      syncState: i.syncState,
      edit: editValues(i, tz),
      timeLabel: timeLabel(i.start, i.end, tz, i.allDay, i.isDeadline),
      whenLabel: `${formatInTz(i.start, tz, { weekday: "long", day: "numeric", month: "long" })} · ${timeLabel(i.start, i.end, tz, i.allDay, i.isDeadline)}`,
      lane: 0,
      lanes: 1,
    };
    if (i.allDay || i.isDeadline) {
      for (const key of dayKeys) {
        const dayStart = zonedToUtc(key, "00:00", tz);
        const dayEnd = zonedToUtc(addDaysToKey(key, 1), "00:00", tz);
        if (i.start < dayEnd && (i.isDeadline ? i.start >= dayStart : i.end > dayStart)) out.push({ ...base, key: `${i.key}:${key}`, dateKey: key, startMin: 0, endMin: 0 });
      }
      continue;
    }
    for (const key of dayKeys) {
      const dayStart = zonedToUtc(key, "00:00", tz);
      const dayEnd = zonedToUtc(addDaysToKey(key, 1), "00:00", tz);
      if (!(i.start < dayEnd && i.end > dayStart)) continue;
      const s = i.start > dayStart ? parseHm(localTimeKey(i.start, tz)) : 0;
      const e = i.end < dayEnd ? parseHm(localTimeKey(i.end, tz)) || 1440 : 1440;
      out.push({ ...base, key: `${i.key}:${key}`, dateKey: key, startMin: s, endMin: Math.max(e, s + 15) });
    }
  }
  // Lanes: overlapping timed items in a day share the column width.
  for (const key of dayKeys) {
    const day = out.filter((c) => c.dateKey === key && !c.allDay && !c.isDeadline).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    let cluster: CalItem[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanesEnd: number[] = [];
      for (const c of cluster) {
        let lane = lanesEnd.findIndex((end) => end <= c.startMin);
        if (lane === -1) lane = lanesEnd.length;
        lanesEnd[lane] = c.endMin;
        c.lane = lane;
      }
      for (const c of cluster) c.lanes = Math.max(1, lanesEnd.length);
    };
    for (const c of day) {
      if (c.startMin >= clusterEnd && cluster.length) {
        flush();
        cluster = [];
      }
      cluster.push(c);
      clusterEnd = Math.max(clusterEnd, c.endMin);
    }
    if (cluster.length) flush();
  }
  return out;
}
