import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Link2, ListChecks } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { aiStatus } from "@/server/ai";
import { getProfile } from "@/server/services/profile";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { KindBadge, TopicProgressMarks } from "@/components/learn/badges";
import { MarkStudied } from "@/components/learn/workspace-ui";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { CardsPanel, CoverageBadge, LearnPanel, NotesPanel, PracticePanel, ResourcesPanel, RevisePanel, SourcesPanel, type TopicContext } from "./panels";

export const metadata: Metadata = { title: "Topic" };

const TABS = [
  { key: "learn", label: "Learn" },
  { key: "sources", label: "Sources" },
  { key: "notes", label: "Notes" },
  { key: "practice", label: "Practice" },
  { key: "cards", label: "Flashcards" },
  { key: "revise", label: "Revise" },
  { key: "resources", label: "Resources" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const MODES = ["SIMPLE", "STANDARD", "DEEP", "EXAM"] as const;

export default async function TopicPage(props: PageProps<"/learn/[subjectId]/topics/[topicId]">) {
  const user = await requireUser();
  const { subjectId, topicId } = await props.params;
  const sp = await props.searchParams;
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? "learn";
  const mode = MODES.find((m) => m === sp.mode) ?? "STANDARD";

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, userId: user.id, syllabus: { subjectId } },
    include: {
      syllabus: { include: { subject: true } },
      unit: true,
      prerequisites: { include: { prerequisite: { select: { id: true, title: true, status: true, kind: true } } } },
      _count: {
        select: {
          notes: true,
          flashcards: true,
          practiceSets: true,
          revisionTasks: { where: { status: "SCHEDULED" } },
          resources: { where: { dismissed: false } },
          sourceLinks: true,
        },
      },
    },
  });
  if (!topic) notFound();
  const [profile, at, neighbours] = await Promise.all([
    getProfile(user.id),
    now(user.id),
    prisma.topic.findMany({ where: { userId: user.id, syllabusId: topic.syllabusId }, orderBy: { order: "asc" }, select: { id: true, title: true, status: true } }),
  ]);
  const index = neighbours.findIndex((t) => t.id === topic.id);
  const prev = index > 0 ? neighbours[index - 1] : null;
  const next = index >= 0 && index < neighbours.length - 1 ? neighbours[index + 1] : null;

  const ctx: TopicContext = { userId: user.id, topic, subjectId, profile, at, ai: aiStatus(), mode };
  const counts: Partial<Record<TabKey, number>> = {
    sources: topic._count.sourceLinks,
    notes: topic._count.notes,
    practice: topic._count.practiceSets,
    cards: topic._count.flashcards,
    revise: topic._count.revisionTasks,
    resources: topic._count.resources,
  };
  const base = `/learn/${subjectId}/topics/${topicId}`;
  const unmet = topic.prerequisites.filter((p) => p.prerequisite.status !== "STUDIED" && p.prerequisite.status !== "SKIPPED");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href={`/learn/${subjectId}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5 shrink-0" aria-hidden /> {topic.syllabus.subject.name}
            {topic.unit ? <span className="hidden sm:inline"> · {topic.unit.title}</span> : null}
          </Link>
        }
        title={topic.title}
        actions={<MarkStudied topicId={topic.id} studied={!!topic.studiedAt || topic.status === "STUDIED"} />}
      />

      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TopicProgressMarks {...topic} />
          <KindBadge kind={topic.kind} origin={topic.origin} />
          <CoverageBadge coverage={topic.coverage} />
          {topic.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3.5" aria-hidden /> ~{formatDuration(topic.estimatedMinutes)} first pass
            </span>
          ) : null}
        </div>
        {topic.objectives.length ? (
          <details className="group text-sm">
            <summary className="cursor-pointer font-medium">
              <ListChecks className="mr-1.5 inline size-4 align-[-3px] text-primary" aria-hidden />
              {topic.objectives.length} objective{topic.objectives.length === 1 ? "" : "s"}{" "}
              <span className="font-normal text-muted">
                {topic.objectivesSource === "SYLLABUS" ? "(from your syllabus)" : topic.objectivesSource === "RULES" ? "(generic — refine them as you learn)" : topic.objectivesSource === "MOCK" ? "(simulated suggestion)" : "(AI-suggested)"}
              </span>
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {topic.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {topic.prerequisites.length ? (
          <p className="flex flex-wrap items-center gap-1 text-sm">
            <Link2 className="size-4 text-muted" aria-hidden />
            <span className="text-muted">Builds on:</span>
            {topic.prerequisites.map((p, i) => (
              <span key={p.prerequisiteId}>
                <Link href={`/learn/${subjectId}/topics/${p.prerequisiteId}`} className={cn("underline-offset-2 hover:underline", unmet.includes(p) ? "font-medium text-warning" : "text-muted")}>
                  {p.prerequisite.title}
                </Link>
                {i < topic.prerequisites.length - 1 ? "," : ""}
              </span>
            ))}
            {unmet.length ? <span className="text-muted">— revisit these first if this topic feels hard.</span> : null}
          </p>
        ) : null}
      </Card>

      <nav aria-label="Topic sections" className="-mx-4 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.key === "learn" ? base : `${base}?tab=${t.key}`}
                scroll={false}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
                  tab === t.key ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg",
                )}
              >
                {t.label}
                {counts[t.key] ? <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums text-muted">{counts[t.key]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "learn" ? <LearnPanel ctx={ctx} /> : null}
      {tab === "sources" ? <SourcesPanel ctx={ctx} /> : null}
      {tab === "notes" ? <NotesPanel ctx={ctx} /> : null}
      {tab === "practice" ? <PracticePanel ctx={ctx} /> : null}
      {tab === "cards" ? <CardsPanel ctx={ctx} /> : null}
      {tab === "revise" ? <RevisePanel ctx={ctx} /> : null}
      {tab === "resources" ? <ResourcesPanel ctx={ctx} /> : null}

      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-sm">
        {prev ? (
          <Link href={`/learn/${subjectId}/topics/${prev.id}`} className="inline-flex max-w-[45%] items-center gap-1.5 text-muted hover:text-fg">
            <ArrowLeft className="size-4 shrink-0" aria-hidden /> <span className="truncate">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/learn/${subjectId}/topics/${next.id}`} className="inline-flex max-w-[45%] items-center gap-1.5 text-right font-medium text-primary hover:underline">
            <span className="truncate">{next.title}</span> <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
