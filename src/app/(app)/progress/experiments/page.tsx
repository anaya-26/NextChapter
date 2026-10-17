import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { experimentProgress, suggestedTemplates } from "@/server/services/experiments";
import { EXPERIMENT_TEMPLATES, formatMetric, METRIC_LABELS, type ExperimentMetric } from "@/lib/experiments";
import { formatInTz } from "@/lib/time";
import { CompleteExperimentForm, CustomExperimentForm, ProposeTemplateButton, StartExperimentButtons } from "@/components/progress/progress-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DemoBadge, EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Experiments" };

const VERDICT: Record<string, string> = { HELPED: "It helped", NO_CHANGE: "No real change", WORSE: "Made things harder", UNSURE: "Not sure" };

export default async function ExperimentsPage() {
  const user = await requireUser();
  const [at, profile] = await Promise.all([now(user.id), getProfile(user.id)]);
  const tz = profile.timezone;
  const [experiments, picks] = await Promise.all([prisma.experiment.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }), suggestedTemplates(user.id, at)]);
  const active = experiments.find((e) => e.status === "ACTIVE");
  const proposed = experiments.filter((e) => e.status === "PROPOSED");
  const done = experiments.filter((e) => e.status === "COMPLETED");
  const progress = active ? await experimentProgress(user.id, active.id, at) : null;
  const metricOf = (m: string) => m as ExperimentMetric;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Study experiments" description="Try one small change for a week or two and compare honestly with before. You decide what worked." />

      {active && progress ? (
        <Card id={active.id} className="flex flex-col gap-4 border-primary/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Running</p>
              <p className="text-lg font-semibold">{active.title}</p>
              <p className="text-sm text-muted">{active.change}</p>
            </div>
            <Badge tone={progress.ended ? "success" : "info"}>{progress.ended ? "Ready to review" : `${progress.daysLeft} day${progress.daysLeft === 1 ? "" : "s"} left`}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-xs text-muted">Before</p>
              <p className="text-2xl font-semibold">{formatMetric(metricOf(active.metric), progress.before.value)}</p>
              <p className="text-xs text-muted">from {progress.before.n}</p>
            </div>
            <div className="rounded-lg bg-primary-soft/50 p-3">
              <p className="text-xs text-muted">During</p>
              <p className="text-2xl font-semibold">{formatMetric(metricOf(active.metric), progress.after.value)}</p>
              <p className="text-xs text-muted">from {progress.after.n}</p>
            </div>
          </div>
          <p className="text-sm">
            <span className="font-medium">{METRIC_LABELS[metricOf(active.metric)].label}.</span> {progress.comparison.note}
          </p>
          <CompleteExperimentForm id={active.id} ended={progress.ended} />
        </Card>
      ) : null}

      {proposed.length ? (
        <Card className="p-5">
          <SectionTitle>Ready to start</SectionTitle>
          <ul className="flex flex-col gap-3">
            {proposed.map((e) => (
              <li key={e.id} id={e.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted">
                    {e.change} Measures: {METRIC_LABELS[metricOf(e.metric)].label.toLowerCase()} over {((e.baseline ?? {}) as { days?: number }).days ?? 7} days.
                  </p>
                </div>
                {active ? <span className="text-xs text-muted">Finish the current experiment first</span> : <StartExperimentButtons id={e.id} />}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionTitle>Ideas that fit your study log</SectionTitle>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EXPERIMENT_TEMPLATES.map((t) => {
            const pick = picks.find((p) => p.id === t.id);
            return (
              <li key={t.id} className={pick ? "flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-4" : "flex flex-col gap-2 rounded-xl border border-border p-4"}>
                <p className="flex items-center gap-1.5 font-medium">
                  <FlaskConical className="size-4 text-primary" aria-hidden /> {t.title}
                </p>
                <p className="text-sm text-muted">{t.change}</p>
                {pick ? <p className="text-xs font-medium text-primary">Why: {pick.why}</p> : null}
                <p className="text-xs text-muted">
                  {t.days} days · measures {METRIC_LABELS[t.metric].label.toLowerCase()}
                </p>
                <div className="mt-auto">
                  <ProposeTemplateButton templateId={t.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <SectionTitle>Design your own</SectionTitle>
        <CustomExperimentForm />
      </Card>

      <section>
        <h2 className="mb-2 font-semibold">Finished</h2>
        {done.length ? (
          <Card className="divide-y divide-border">
            {done.map((e) => {
              const r = (e.result ?? {}) as { before?: { value: number | null }; after?: { value: number | null } };
              return (
                <div key={e.id} className="flex flex-col gap-1 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{e.title}</p>
                    {e.verdict ? <Badge tone={e.verdict === "HELPED" ? "success" : "neutral"}>{VERDICT[e.verdict]}</Badge> : null}
                    {e.isDemo ? <DemoBadge /> : null}
                  </div>
                  <p className="text-muted">
                    {METRIC_LABELS[metricOf(e.metric)]?.label ?? e.metric}: {formatMetric(metricOf(e.metric), r.before?.value ?? null)} before → {formatMetric(metricOf(e.metric), r.after?.value ?? null)} during
                    {e.endAt ? ` · ended ${formatInTz(e.endAt, tz, { day: "numeric", month: "short" })}` : ""}
                  </p>
                  {e.reflection ? <p>“{e.reflection}”</p> : null}
                </div>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={FlaskConical} title="No finished experiments yet" description="Small, honest experiments are how you find the study habits that work for you." />
        )}
      </section>
    </div>
  );
}
