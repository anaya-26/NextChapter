import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { studyLog } from "@/server/services/journal";
import { formatDuration, formatInTz, zonedToUtc } from "@/lib/time";
import { MoodDot } from "@/components/journal/journal-ui";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Study log" };

export default async function StudyLogPage() {
  const user = await requireUser();
  const [profile, at] = await Promise.all([getProfile(user.id), now(user.id)]);
  const tz = profile.timezone;
  const log = await studyLog(user.id, at, 14);
  const max = Math.max(60, ...log.map((d) => Math.max(d.plannedMinutes, d.actualMinutes)));
  const totals = log.reduce((t, d) => ({ planned: t.planned + d.plannedMinutes, actual: t.actual + d.actualMinutes }), { planned: 0, actual: 0 });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Study log"
        description={`Planned vs actual over the last two weeks: ${formatDuration(totals.actual)} studied${totals.planned ? ` of ${formatDuration(totals.planned)} planned` : ""}. Missed sessions are information, not failure.`}
      />
      <Card className="divide-y divide-border">
        {log.map((d) => (
          <div key={d.dateKey} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{formatInTz(zonedToUtc(d.dateKey, "12:00", tz), tz, { weekday: "long", day: "numeric", month: "short" })}</p>
              <div className="flex items-center gap-3 text-sm">
                <MoodDot mood={d.mood} />
                <span className="text-muted">
                  {formatDuration(d.actualMinutes)}
                  {d.plannedMinutes ? ` / ${formatDuration(d.plannedMinutes)} planned` : ""}
                </span>
              </div>
            </div>
            {d.plannedMinutes || d.actualMinutes ? (
              <div className="relative h-2.5 max-w-xl overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${d.actualMinutes} of ${d.plannedMinutes} planned minutes`}>
                <div className="absolute inset-y-0 left-0 rounded-full border border-primary/40" style={{ width: `${(d.plannedMinutes / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(d.actualMinutes / max) * 100}%` }} />
              </div>
            ) : null}
            {d.sessions.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {d.sessions.map((s) => {
                  const done = s.status === "COMPLETED" || s.status === "PARTIAL";
                  const Icon = done ? CheckCircle2 : s.status === "MISSED" ? XCircle : CircleDashed;
                  return (
                    <li key={s.id} className="flex flex-wrap items-start gap-2">
                      <Icon className={done ? "mt-0.5 size-4 text-success" : s.status === "MISSED" ? "mt-0.5 size-4 text-muted" : "mt-0.5 size-4 text-info"} aria-label={s.status.toLowerCase()} />
                      <span className="min-w-0 flex-1">
                        {s.topic ? (
                          <Link href={`/learn/${s.topic.syllabus.subjectId}/topics/${s.topic.id}`} className="hover:underline">
                            {s.topic.title}
                          </Link>
                        ) : (
                          (s.title ?? "Study")
                        )}
                        <span className="text-muted">
                          {" "}
                          · {done ? `${s.actualMinutes} min` : s.status === "MISSED" ? `didn’t happen${s.missedReason ? ` (${s.missedReason})` : ""}` : s.status === "IN_PROGRESS" ? "in progress" : `planned ${s.plannedMinutes} min`}
                          {s.isDemo ? " · demo" : ""}
                        </span>
                        {s.achievements ? <span className="block text-xs text-muted">Went well: {s.achievements}</span> : null}
                        {s.difficulties ? <span className="block text-xs text-muted">Difficult: {s.difficulties}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing planned or logged.</p>
            )}
          </div>
        ))}
      </Card>
      <p className="text-sm text-muted">
        Studied without a plan?{" "}
        <Link href="/today" className="font-medium text-primary underline">
          Log it from Today
        </Link>
        .
      </p>
    </div>
  );
}
