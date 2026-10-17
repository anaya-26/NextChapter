import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, Clock, FileStack, FileUp, Link2, ListChecks, Pencil, Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getRoadmap, summariseTopics } from "@/server/services/syllabus";
import { nextStep } from "@/lib/roadmap";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { reopenSyllabus } from "../actions";
import { JobProgress } from "@/components/learn/job-progress";
import { ExtractionBadge, KindBadge, TopicProgressMarks } from "@/components/learn/badges";
import { AddTopicForm, TopicActions } from "@/components/learn/topic-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Roadmap" };

export default async function RoadmapPage(props: PageProps<"/learn/[subjectId]">) {
  const user = await requireUser();
  const { subjectId } = await props.params;
  const { show, confirmed } = await props.searchParams;
  const data = await getRoadmap(user.id, subjectId);
  if (!data) notFound();
  const { subject, syllabi } = data;
  const at = await now(user.id);
  const syllabus = syllabi.find((s) => s.status === "CONFIRMED") ?? null;
  const pending = syllabi.find((s) => s.status !== "CONFIRMED") ?? null;

  if (!syllabus) {
    return (
      <div>
        <PageHeader eyebrow="Learn" title={subject.name} />
        {pending ? (
          <Card className="flex flex-col gap-3 p-5">
            <p className="font-medium">{pending.status === "NEEDS_REVIEW" ? "Your syllabus is ready to check." : "Your syllabus is being read."}</p>
            <Link className={buttonVariants({ className: "self-start" })} href={`/learn/${subject.id}/syllabus/${pending.id}`}>
              {pending.status === "NEEDS_REVIEW" ? "Check and confirm" : "View progress"} <ArrowRight />
            </Link>
          </Card>
        ) : (
          <EmptyState
            icon={FileUp}
            title="Start with your syllabus"
            description="A photo, PDF or pasted text is enough — even without textbooks, Kadam can build a roadmap and find resources."
            action={
              <Link className={buttonVariants()} href={`/learn/${subject.id}/syllabus/new`}>
                Add syllabus
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const enrichJob = await prisma.job.findFirst({
    where: { userId: user.id, type: "roadmap.enrich", payload: { path: ["syllabusId"], equals: syllabus.id }, status: { in: ["QUEUED", "RUNNING"] } },
  });
  const topics = syllabus.topics;
  const summary = summariseTopics(topics);
  const filter = show === "syllabus" ? "syllabus" : "all";
  const visible = filter === "syllabus" ? topics.filter((t) => t.kind === "REQUIRED") : topics;
  const step = nextStep(topics.map((t) => ({ ...t, prerequisiteIds: t.prerequisites.map((p) => p.prerequisiteId) })));
  const daysToExam = subject.examDate ? Math.ceil((subject.examDate.getTime() - at.getTime()) / 86400000) : null;
  const assessment = (syllabus.assessment as { label: string; detail: string }[] | null) ?? [];

  const groups = [
    ...syllabus.units.map((u) => ({ id: u.id, title: u.title, topics: visible.filter((t) => t.unitId === u.id) })),
    { id: "none", title: "Other topics", topics: visible.filter((t) => !t.unitId || !syllabus.units.some((u) => u.id === t.unitId)) },
  ].filter((g) => g.topics.length);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Learn · Roadmap"
        title={subject.name}
        description={syllabus.title}
        actions={
          <>
            {syllabus.extractionMethod ? <ExtractionBadge method={syllabus.extractionMethod} /> : null}
            <Link href={`/learn/${subject.id}/materials`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileStack /> Materials
            </Link>
            <form action={reopenSyllabus.bind(null, syllabus.id)}>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Pencil /> Edit syllabus
              </button>
            </form>
          </>
        }
      />

      {confirmed ? (
        <Notice tone="success" title="Syllabus confirmed — roadmap ready">
          Detailed explanations, practice and resources are prepared when you open a topic.
        </Notice>
      ) : null}
      {enrichJob ? (
        <Card className="p-5">
          <JobProgress jobId={enrichJob.id} label="Adding objectives, prerequisites and effort estimates" />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Syllabus progress</p>
              <p className="text-3xl font-semibold">{summary.percent}%</p>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Clock className="size-4" aria-hidden /> ~{formatDuration(summary.remainingMinutes)} of first-pass study left
            </p>
          </div>
          <Progress value={summary.percent} className="mt-3" label="Topics studied" />
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-muted">Studied</dt>
              <dd className="text-lg font-semibold">
                {summary.studied}/{summary.total - summary.skipped}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-muted">Understanding checked</dt>
              <dd className="text-lg font-semibold">{summary.checked}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-muted">Revised</dt>
              <dd className="text-lg font-semibold">{summary.revised}</dd>
            </div>
          </dl>
          {summary.skipped ? <p className="mt-2 text-xs text-muted">{summary.skipped} topic(s) skipped as already familiar.</p> : null}
        </Card>
        <Card className="order-first flex flex-col gap-3 p-5 md:order-none">
          {daysToExam !== null ? (
            <p className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-primary" aria-hidden />
              {daysToExam >= 0 ? (
                <span>
                  Exam in <strong>{daysToExam} days</strong>
                </span>
              ) : (
                <span>Exam date has passed</span>
              )}
            </p>
          ) : null}
          {step ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next step</p>
              <p className="font-semibold">{step.topic.title}</p>
              <p className="text-sm text-muted">{step.reason}</p>
              <Link href={`/learn/${subject.id}/topics/${step.topic.id}`} className={buttonVariants({ className: "self-start" })}>
                Start <ArrowRight />
              </Link>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-accent" aria-hidden /> Every syllabus topic is studied or skipped — time to revise and practise.
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Show:</span>
        <Link href={`/learn/${subject.id}`} className={cn("rounded-full px-3 py-1", filter === "all" ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Everything
        </Link>
        <Link href={`/learn/${subject.id}?show=syllabus`} className={cn("rounded-full px-3 py-1", filter === "syllabus" ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Syllabus requirements only
        </Link>
        <span className="ml-auto flex flex-wrap gap-1.5 text-xs text-muted">
          <Badge tone="info">Background</Badge> = foundation beyond the syllabus · <Badge tone="accent">Optional</Badge> = exploration
        </span>
      </div>

      {groups.map((g) => {
        const s = summariseTopics(g.topics);
        return (
          <section key={g.id} aria-labelledby={`unit-${g.id}`}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 id={`unit-${g.id}`} className="font-semibold">
                {g.title}
              </h2>
              {s.total ? <span className="shrink-0 text-xs text-muted">{s.studied}/{s.total - s.skipped} studied</span> : null}
            </div>
            <Card className="divide-y divide-border">
              {g.topics.map((t) => {
                const unmet = t.prerequisites.filter((p) => !(p.prerequisite.status === "STUDIED" || p.prerequisite.status === "SKIPPED"));
                // Only nudge about foundations when it matters: the student has started this topic,
                // or an unfinished background foundation underpins it.
                const nudge = t.status !== "SKIPPED" && unmet.some((p) => t.status === "IN_PROGRESS" || p.prerequisite.kind === "BACKGROUND");
                return (
                  <div key={t.id} className={cn("flex items-start gap-3 p-4", t.status === "SKIPPED" && "opacity-70")}>
                    <span className="mt-0.5 w-6 shrink-0 text-right text-sm tabular-nums text-muted">{topics.indexOf(t) + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/learn/${subject.id}/topics/${t.id}`} className="font-medium hover:text-primary hover:underline">
                          {t.title}
                        </Link>
                        <KindBadge kind={t.kind} origin={t.origin} />
                      </div>
                      {t.description && t.kind !== "REQUIRED" ? <p className="mt-0.5 text-sm text-muted">{t.description}</p> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <TopicProgressMarks {...t} />
                        {t.coverage === "MISSING" ? <span className="text-danger">Not in your materials</span> : t.coverage === "PARTIAL" ? <span className="text-warning">Partly in your materials</span> : null}
                        {t.estimatedMinutes ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" aria-hidden /> ~{formatDuration(t.estimatedMinutes)}
                          </span>
                        ) : null}
                        {t.objectives.length ? (
                          <span className="inline-flex items-center gap-1" title={t.objectives.join("\n")}>
                            <ListChecks className="size-3.5" aria-hidden /> {t.objectives.length} objectives
                            {t.objectivesSource === "RULES" ? " (generic)" : t.objectivesSource === "SYLLABUS" ? " (from syllabus)" : ""}
                          </span>
                        ) : null}
                      </div>
                      {t.prerequisites.length ? (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                          <Link2 className="size-3.5 text-muted" aria-hidden />
                          <span className="text-muted">Builds on:</span>
                          {t.prerequisites.map((p, i) => (
                            <span key={p.prerequisiteId}>
                              <Link
                                href={`/learn/${subject.id}/topics/${p.prerequisiteId}`}
                                className={cn("underline-offset-2 hover:underline", nudge && unmet.some((u) => u.prerequisiteId === p.prerequisiteId) ? "font-medium text-warning" : "text-muted")}
                              >
                                {p.prerequisite.title}
                              </Link>
                              {i < t.prerequisites.length - 1 ? "," : ""}
                            </span>
                          ))}
                          {nudge ? <span className="text-warning">— revisit first if this feels hard</span> : null}
                        </p>
                      ) : null}
                    </div>
                    <TopicActions id={t.id} title={t.title} kind={t.kind} skipped={t.status === "SKIPPED"} canDelete={t.origin !== "SYLLABUS"} />
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}

      <Card className="p-5">
        <SectionTitle>Add a topic</SectionTitle>
        <p className="mb-3 text-sm text-muted">Add a foundation you want to revisit, something to explore, or a syllabus topic that was missed.</p>
        <AddTopicForm syllabusId={syllabus.id} units={syllabus.units.map((u) => ({ id: u.id, title: u.title }))} />
      </Card>

      {assessment.length ? (
        <Card className="p-5">
          <SectionTitle>Assessment (as stated in your syllabus)</SectionTitle>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {assessment.map((a, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                <span className="font-medium">{a.label}:</span> {a.detail}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
