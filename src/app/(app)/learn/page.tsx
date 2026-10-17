import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { summariseTopics } from "@/server/services/syllabus";
import { AddSubjectForm } from "@/components/learn/add-subject";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";
import { LearnTabs } from "@/components/learn/learn-tabs";

export const metadata: Metadata = { title: "Learn" };

export default async function LearnPage() {
  const user = await requireUser();
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: {
      syllabi: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          topics: { select: { kind: true, status: true, studiedAt: true, understandingCheckedAt: true, lastRevisedAt: true, estimatedMinutes: true } },
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Learn" description="Each subject gets a roadmap from its syllabus. Open a topic for explanations from your own materials, practice and revision." />
      <LearnTabs />
      {subjects.length === 0 ? (
        <EmptyState icon={BookOpen} title="Add your first subject" description="Then add its syllabus — a photo is enough." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => {
            const confirmed = s.syllabi.find((x) => x.status === "CONFIRMED");
            const draft = s.syllabi.find((x) => x.status !== "CONFIRMED");
            const summary = confirmed ? summariseTopics(confirmed.topics) : null;
            return (
              <Link key={s.id} href={`/learn/${s.id}`} className="group">
                <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-primary">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: s.color ?? "var(--primary)" }} aria-hidden />
                      <h2 className="font-semibold">{s.name}</h2>
                    </div>
                    {s.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                  </div>
                  {summary ? (
                    <>
                      <Progress value={summary.percent} label={`${s.name} progress`} />
                      <p className="text-sm text-muted">
                        {summary.studied}/{summary.total - summary.skipped} studied · {summary.checked} checked · {summary.revised} revised
                      </p>
                    </>
                  ) : draft ? (
                    <Badge tone="warning" className="self-start">
                      {draft.status === "NEEDS_REVIEW" ? "Syllabus ready to check" : "Reading syllabus…"}
                    </Badge>
                  ) : (
                    <p className="text-sm text-muted">No syllabus yet</p>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {summary ? "Open roadmap" : draft ? "Continue" : "Add syllabus"} <ArrowRight className="size-4" aria-hidden />
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <Card className="p-5">
        <SectionTitle>Add a subject</SectionTitle>
        <AddSubjectForm />
      </Card>
    </div>
  );
}
