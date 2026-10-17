import type { Metadata } from "next";
import Link from "next/link";
import { Award, Lock, Sunrise, TrendingUp } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { progressOverview } from "@/server/services/progress";
import { XP_RULES } from "@/lib/xp-rules";
import { formatInTz, zonedToUtc } from "@/lib/time";
import { getProfile } from "@/server/services/profile";
import { ActivityHeatmap, ColumnChart, LineChart } from "@/components/charts/charts";
import { GrowthTree } from "@/components/progress/growth-tree";
import { DisplayPrefs } from "@/components/progress/progress-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DemoBadge, Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "My Progress" };

export default async function ProgressPage() {
  const user = await requireUser();
  const [at, profile] = await Promise.all([now(user.id), getProfile(user.id)]);
  const p = await progressOverview(user.id, at);
  const tz = profile.timezone;
  const weekLabel = (k: string) => `${Number(k.slice(8, 10))}/${Number(k.slice(5, 7))}`;
  const dayLabel = (k: string) => formatInTz(zonedToUtc(k, "12:00", tz), tz, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="My Progress" description="Real improvement over time — what you studied, how well it’s sticking, and how consistently you show up." actions={p.hasDemo ? <DemoBadge /> : null} />
      {p.hasDemo ? <Notice tone="warning">Some of this history is labelled demo data (Settings → Developer). Remove it any time.</Notice> : null}

      {!p.quiet ? (
        <Card className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          {p.showGrowth ? <GrowthTree level={p.xp.level} className="mx-auto size-36 sm:size-40" /> : null}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Level</p>
            <p className="text-4xl font-semibold">{p.xp.level}</p>
            <Progress value={Math.round(p.xp.progress * 100)} label="Progress to next level" />
            <p className="text-sm text-muted">
              {p.xp.total} XP · {p.xp.next - p.xp.total} XP to level {p.xp.level + 1}
            </p>
            {p.returns ? (
              <p className="flex items-center gap-1.5 text-sm">
                <Sunrise className="size-4 text-accent" aria-hidden /> You’ve come back after a break {p.returns} time{p.returns === 1 ? "" : "s"}. That’s the hardest part.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="size-4 text-primary" aria-hidden /> Real improvement
          </span>
        </SectionTitle>
        {p.improvements.length ? (
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
            {p.improvements.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">NextChapter only claims improvement when there’s enough practice and revision data to compare. Keep going and trends will appear here.</p>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ColumnChart title="Study time per week" unit="minutes" valueLabel="Studied" targetLabel="Planned" data={p.series.map((w) => ({ label: weekLabel(w.weekKey), value: w.actualMinutes, target: w.plannedMinutes || null }))} />
          <LineChart title="Practice accuracy" emptyText="Answer practice questions to see this." data={p.series.map((w) => ({ label: weekLabel(w.weekKey), value: w.accuracy, n: w.attempts }))} />
          <LineChart title="Recall at revision" emptyText="Complete revisions to see this." data={p.series.map((w) => ({ label: weekLabel(w.weekKey), value: w.recall, n: w.revisions }))} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Consistency</SectionTitle>
          <p className="mb-3 text-sm text-muted">Active on {p.activeLast14} of the last 14 days. No streaks to lose — just showing up.</p>
          <ActivityHeatmap days={p.heat.map((h) => ({ ...h, label: dayLabel(h.dateKey) }))} />
        </Card>
        <Card className="p-5">
          <SectionTitle>Topics</SectionTitle>
          {p.topicStats.length ? (
            <ul className="flex flex-col gap-3">
              {p.topicStats.map((s) => (
                <li key={s.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <Link href={`/learn/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.isDemo ? <DemoBadge /> : null}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                    {[
                      ["Studied", s.studied],
                      ["Understanding checked", s.checked],
                      ["Revised", s.revised],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-lg bg-surface-2 p-2">
                        <dd className="text-base font-semibold tabular-nums">
                          {n}/{s.total}
                        </dd>
                        <dt className="text-muted">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Add a syllabus in Learn to track topics.</p>
          )}
          {p.recurring.length ? (
            <p className="mt-3 text-sm">
              Recurring difficulties:{" "}
              {p.recurring.map((r, i) => (
                <span key={r.topic.id}>
                  <Link href={`/learn/mistakes?topic=${r.topic.id}`} className="text-primary hover:underline">
                    {r.topic.title}
                  </Link>
                  {i < p.recurring.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          ) : null}
        </Card>
      </div>

      {!p.quiet ? (
        <>
          <Card className="p-5">
            <SectionTitle>Badges</SectionTitle>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {p.badges.map((b) => (
                <li key={b.code} className={b.awardedAt ? "rounded-xl border border-primary/30 bg-primary-soft/40 p-3" : "rounded-xl border border-dashed border-border p-3 opacity-75"}>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {b.awardedAt ? <Award className="size-4 text-accent" aria-hidden /> : <Lock className="size-4 text-muted" aria-hidden />}
                    {b.name}
                  </p>
                  <p className="text-xs text-muted">{b.description}</p>
                  {b.awardedAt ? <p className="mt-1 text-xs text-muted">Earned {formatInTz(b.awardedAt, tz, { day: "numeric", month: "short" })}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <SectionTitle>Recent XP</SectionTitle>
              {p.recentXp.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {p.recentXp.map((x) => (
                    <li key={x.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {x.reason}
                        {x.isDemo ? <span className="text-muted"> · demo</span> : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">+{x.points}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing yet.</p>
              )}
            </Card>
            <Card className="p-5">
              <SectionTitle>How XP works</SectionTitle>
              <p className="mb-2 text-sm text-muted">XP rewards meaningful work, once. Repeating the same thing doesn’t add more, and daily caps keep it honest.</p>
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(XP_RULES).map(([k, r]) => (
                  <li key={k} className="flex gap-2">
                    <Badge className="shrink-0">{r.label}</Badge>
                    <span className="text-muted">{r.rule}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      <Card className="p-5">
        <SectionTitle>Display</SectionTitle>
        <DisplayPrefs quiet={p.quiet} showGrowth={p.showGrowth} />
      </Card>
    </div>
  );
}
