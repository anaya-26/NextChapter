import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, NotebookPen } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { listMistakes, recurringDifficulties } from "@/server/services/mistakes";
import { cn } from "@/lib/utils";
import { LearnTabs } from "@/components/learn/learn-tabs";
import { AddMistakeForm, MistakeActions } from "@/components/learn/library-ui";
import { CitedMarkdown } from "@/components/learn/cited-markdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DemoBadge, EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Mistake library" };

const FILTERS = [
  { key: "open", label: "To work on" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

export default async function MistakesPage(props: PageProps<"/learn/mistakes">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.show)?.key ?? "open";
  const topicId = typeof sp.topic === "string" ? sp.topic : undefined;
  const [all, recurring, topics] = await Promise.all([
    listMistakes(user.id, filter),
    recurringDifficulties(user.id),
    prisma.topic.findMany({
      where: { userId: user.id, syllabus: { status: "CONFIRMED" } },
      orderBy: [{ syllabus: { subject: { name: "asc" } } }, { order: "asc" }],
      select: { id: true, title: true, syllabus: { select: { subject: { select: { name: true } } } } },
    }),
  ]);
  const mistakes = topicId ? all.filter((m) => m.topicId === topicId) : all;
  const topicTitle = topicId ? topics.find((t) => t.id === topicId)?.title : null;
  const qs = (show: string) => `/learn/mistakes?show=${show}${topicId ? `&topic=${topicId}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Learn" description="Every mistake is a clue. Revisit them, turn them into flashcards, and mark them resolved once later practice goes right." />
      <LearnTabs />
      {recurring.length ? (
        <Notice tone="warning" title="Recurring difficulties">
          {recurring.map((r, i) => (
            <span key={r.topic.id}>
              <Link href={`/learn/mistakes?topic=${r.topic.id}`} className="font-medium underline">
                {r.topic.title}
              </Link>{" "}
              ({r.count} open){i < recurring.length - 1 ? ", " : ""}
            </span>
          ))}
          . Going back to the explanation or its foundations may help more than more practice.
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f.key} href={qs(f.key)} className={cn("rounded-full px-3 py-1", filter === f.key ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
            {f.label}
          </Link>
        ))}
        {topicTitle ? (
          <span className="ml-auto">
            Topic: <strong>{topicTitle}</strong> ·{" "}
            <Link href={`/learn/mistakes?show=${filter}`} className="text-primary underline">
              all topics
            </Link>
          </span>
        ) : null}
      </div>

      {mistakes.length ? (
        <div className="flex flex-col gap-3">
          {mistakes.map((m) => (
            <Card key={m.id} className="flex flex-col gap-2 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{m.title}</p>
                  {m.topic ? (
                    <Link href={`/learn/${m.topic.syllabus.subjectId}/topics/${m.topic.id}`} className="text-sm text-primary hover:underline">
                      {m.topic.title}
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.isDemo ? <DemoBadge /> : null}
                  <Badge tone={m.status === "RESOLVED" ? "success" : m.status === "PRACTISING" ? "info" : "warning"}>
                    {m.status === "RESOLVED" ? "Resolved" : m.status === "PRACTISING" ? `Revisited ×${m.reviewCount}` : "Open"}
                  </Badge>
                </div>
              </div>
              {m.question ? (
                <details className="rounded-lg bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">The question</summary>
                  <p className="mt-1">{m.question.prompt}</p>
                  {m.question.explanation ? (
                    <div className="mt-2 border-t border-border pt-2">
                      <CitedMarkdown markdown={m.question.explanation} />
                    </div>
                  ) : null}
                </details>
              ) : null}
              <p className="text-sm">
                <span className="font-medium">What went wrong: </span>
                {m.whatWentWrong}
              </p>
              {m.misconception ? (
                <p className="text-sm text-muted">
                  <span className="font-medium">Possible misconception: </span>
                  {m.misconception}
                </p>
              ) : null}
              {m.correctApproach ? (
                <p className="text-sm">
                  <span className="font-medium">Right approach: </span>
                  {m.correctApproach}
                </p>
              ) : null}
              <MistakeActions id={m.id} resolved={m.status === "RESOLVED"} hasCard={m.flashcards.length > 0} />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={filter === "resolved" ? NotebookPen : AlertTriangle}
          title={filter === "resolved" ? "No resolved mistakes yet" : "No mistakes to work on"}
          description="When practice goes wrong, choose “Add to my mistake library” — or record one from a test or class below."
        />
      )}

      <Card className="p-4 sm:p-5">
        <SectionTitle>Record a mistake from a test, homework or class</SectionTitle>
        <AddMistakeForm topics={topics.map((t) => ({ id: t.id, label: `${t.syllabus.subject.name} — ${t.title}` }))} defaultTopicId={topicId} />
      </Card>
    </div>
  );
}
