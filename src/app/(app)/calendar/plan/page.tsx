import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gauge, Lightbulb } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { proposePlan, type PlanOptions } from "@/server/services/planner";
import { formatDuration, formatInTz, localDateKey, zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ApplyPlanButton } from "@/components/calendar/planning-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Plan my week" };

function optionsFrom(sp: Record<string, string | string[] | undefined>): PlanOptions {
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    days: Math.min(14, Math.max(1, num(sp.days) ?? 7)),
    extraMinutesPerDay: Math.min(120, num(sp.extra) ?? 0) || undefined,
    quickReview: sp.quick === "1" || undefined,
    deadlinesOnly: sp.deadlines === "1" || undefined,
    includeOptional: sp.optional === "1" || undefined,
    ignoreExistingPlan: sp.replan === "1" || undefined,
  };
}

function hrefFor(o: PlanOptions) {
  const q = new URLSearchParams();
  if (o.days && o.days !== 7) q.set("days", String(o.days));
  if (o.extraMinutesPerDay) q.set("extra", String(o.extraMinutesPerDay));
  if (o.quickReview) q.set("quick", "1");
  if (o.deadlinesOnly) q.set("deadlines", "1");
  if (o.includeOptional) q.set("optional", "1");
  if (o.ignoreExistingPlan) q.set("replan", "1");
  const s = q.toString();
  return `/calendar/plan${s ? `?${s}` : ""}`;
}

export default async function PlanPage(props: PageProps<"/calendar/plan">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const opts = optionsFrom(sp);
  const at = await now(user.id);
  const plan = await proposePlan(user.id, at, opts);
  const tz = plan.timezone;
  const { result } = plan;
  const blocksByDay = result.days.map((d) => ({ ...d, blocks: result.blocks.filter((b) => b.dateKey === d.dateKey) }));
  const maxBar = Math.max(1, ...result.days.map((d) => Math.max(d.capMinutes, d.existingMinutes + d.plannedMinutes)));
  const replan = !!opts.ignoreExistingPlan;
  const changed = !!(opts.extraMinutesPerDay || opts.quickReview || opts.deadlinesOnly || (opts.days ?? 7) !== 7);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/calendar" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Calendar
          </Link>
        }
        title="Plan my study time"
        description="Kadam fits your next topics, deadlines and exam revision into free time around classes and commitments — with breaks, a daily limit and buffers. Nothing is added until you agree."
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={hrefFor({ ...opts, ignoreExistingPlan: undefined })} className={cn("rounded-full px-3 py-1", !replan ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Add to my current plan
        </Link>
        <Link href={hrefFor({ ...opts, ignoreExistingPlan: true })} className={cn("rounded-full px-3 py-1", replan ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Re-plan from scratch
        </Link>
        <Link href={hrefFor({ ...opts, includeOptional: opts.includeOptional ? undefined : true })} className={cn("rounded-full px-3 py-1", opts.includeOptional ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Include optional topics
        </Link>
        {changed ? (
          <Link href={hrefFor({ ignoreExistingPlan: opts.ignoreExistingPlan, includeOptional: opts.includeOptional })} className="text-primary underline">
            Reset choices
          </Link>
        ) : null}
      </div>

      {plan.tasks.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nothing to plan yet"
          description="Add a syllabus in Learn, or a deadline or exam in the calendar — then Kadam can plan study time for it."
          action={
            <Link href="/learn" className={buttonVariants()}>
              Go to Learn
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-sm text-muted">Fits in the next {plan.days} days</p>
              <p className="text-2xl font-semibold">{formatDuration(result.placedMinutes)}</p>
              <p className="text-sm text-muted">of {formatDuration(result.neededMinutes)} of work</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">Daily study limit</p>
              <p className="text-2xl font-semibold">{formatDuration(plan.cap)}</p>
              <p className="text-sm text-muted">
                <Link href="/settings" className="underline">
                  Change your weekly target
                </Link>
              </p>
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Gauge className="size-4" aria-hidden /> Your pace
              </p>
              {plan.pace.basedOn >= 3 ? (
                <>
                  <p className="text-2xl font-semibold">×{plan.pace.factor.toFixed(2)}</p>
                  <p className="text-sm text-muted">Topics take you {plan.pace.factor > 1 ? "longer" : plan.pace.factor < 1 ? "less time" : "about as long"} than estimated (from {plan.pace.basedOn} sessions) — times are adjusted.</p>
                </>
              ) : (
                <p className="text-sm text-muted">Estimates adapt to your real pace after 3 finished sessions ({plan.pace.basedOn} so far).</p>
              )}
            </Card>
          </div>

          {plan.overflowMinutes > 0 ? (
            <Notice tone="warning" title={`${formatDuration(plan.overflowMinutes)} doesn’t fit`}>
              <ul className="mb-2 list-disc pl-5">
                {result.overflow.map((o) => (
                  <li key={o.taskId}>
                    {o.title}: {formatDuration(o.minutes)} short{o.dueAt ? ` before ${formatInTz(new Date(o.dueAt), tz, { weekday: "short", day: "numeric", month: "short" })}` : ""}
                  </li>
                ))}
              </ul>
              {plan.choices.length ? <p className="font-medium">Choose what to do:</p> : <p>Try a longer daily limit in Settings or move a deadline if you can.</p>}
            </Notice>
          ) : null}
          {plan.choices.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plan.choices.map((c) => (
                <Link key={c.id} href={hrefFor(c.options)} className="group">
                  <Card className="flex h-full flex-col gap-1 p-4 transition-colors group-hover:border-primary">
                    <p className="font-semibold">{c.label}</p>
                    <p className="text-sm text-muted">{c.detail}</p>
                    <p className="mt-auto pt-2 text-sm">{c.overflowMinutes === 0 ? <Badge tone="success">Everything fits</Badge> : <Badge tone="warning">{formatDuration(c.overflowMinutes)} still left over</Badge>}</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}
          {plan.assumptions.length ? (
            <Notice tone="neutral" title="Assumptions">
              <ul className="list-disc pl-5">
                {plan.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <Card className="p-4 sm:p-5">
            <SectionTitle>Workload vs. free time</SectionTitle>
            <ul className="flex flex-col gap-2">
              {blocksByDay.map((d) => {
                const label = formatInTz(zonedToUtc(d.dateKey, "12:00", tz), tz, { weekday: "short", day: "numeric", month: "short" });
                return (
                  <li key={d.dateKey} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
                    <span className={cn(d.dateKey === localDateKey(at, tz) && "font-semibold text-primary")}>{label}</span>
                    <div>
                      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${d.existingMinutes} min already planned, ${d.plannedMinutes} min proposed, limit ${d.capMinutes} min, ${d.freeMinutes} min free`}>
                        <div className="absolute inset-y-0 left-0 bg-primary/40" style={{ width: `${(d.existingMinutes / maxBar) * 100}%` }} />
                        <div className="absolute inset-y-0 bg-primary" style={{ left: `${(d.existingMinutes / maxBar) * 100}%`, width: `${(d.plannedMinutes / maxBar) * 100}%` }} />
                        <div className="absolute inset-y-0 w-0.5 bg-fg/50" style={{ left: `${(d.capMinutes / maxBar) * 100}%` }} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {d.existingMinutes ? `${formatDuration(d.existingMinutes)} planned already · ` : ""}+{formatDuration(d.plannedMinutes)} proposed · {formatDuration(d.freeMinutes)} free
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">Bar: light = already planned, dark = proposed, line = daily limit. Free time excludes classes, commitments, busy times and 10-minute buffers.</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle>Proposed sessions</SectionTitle>
            {result.blocks.length ? (
              <ol className="flex flex-col gap-3">
                {blocksByDay
                  .filter((d) => d.blocks.length)
                  .map((d) => (
                    <li key={d.dateKey}>
                      <p className="mb-1 text-sm font-medium">{formatInTz(zonedToUtc(d.dateKey, "12:00", tz), tz, { weekday: "long", day: "numeric", month: "short" })}</p>
                      <ul className="flex flex-col gap-1">
                        {d.blocks.map((b) => (
                          <li key={`${b.taskId}-${b.start}`} className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate">{b.title}</span>
                            <span className="shrink-0 text-muted">
                              {formatInTz(new Date(b.start), tz, { hour: "numeric", minute: "2-digit" })} · {b.minutes} min
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">No free time matches your study windows in this period.</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ApplyPlanButton options={{ ...opts, ignoreExistingPlan: undefined }} replace={replan} count={result.blocks.length} />
              <span className="text-xs text-muted">You can move or delete any session afterwards.</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
