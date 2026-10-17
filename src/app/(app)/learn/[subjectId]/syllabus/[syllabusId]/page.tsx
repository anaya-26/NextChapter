import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, RotateCcw } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { getSyllabus } from "@/server/services/syllabus";
import { retryExtraction } from "../../../actions";
import { JobProgress } from "@/components/learn/job-progress";
import { OutlineEditor, type OutlineUnitInit } from "@/components/learn/outline-editor";
import { ExtractionBadge } from "@/components/learn/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Check your syllabus" };

export default async function SyllabusPage(props: PageProps<"/learn/[subjectId]/syllabus/[syllabusId]">) {
  const user = await requireUser();
  const { subjectId, syllabusId } = await props.params;
  const { edit } = await props.searchParams;
  const syllabus = await getSyllabus(user.id, syllabusId);
  if (!syllabus || syllabus.subjectId !== subjectId) notFound();
  if (syllabus.status === "CONFIRMED" && !edit) redirect(`/learn/${subjectId}`);

  const job = await prisma.job.findFirst({
    where: { userId: user.id, type: "syllabus.extract", payload: { path: ["syllabusId"], equals: syllabusId } },
    orderBy: { createdAt: "desc" },
  });
  const files = await prisma.storedFile.findMany({
    where: { userId: user.id, key: { in: syllabus.sources.map((s) => s.fileKey).filter((k): k is string => !!k) } },
    select: { id: true, key: true },
  });
  const fileId = (key: string | null) => files.find((f) => f.key === key)?.id;

  const back = (
    <Link href={`/learn/${subjectId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden /> {syllabus.subject.name}
    </Link>
  );

  if (syllabus.status === "EXTRACTING" || syllabus.status === "DRAFT") {
    const failed = job?.status === "FAILED";
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <PageHeader title="Reading your syllabus" description="This usually takes under a minute. You can leave this page — the work continues in the background." />
        <Card className="flex flex-col gap-4 p-5">
          {failed ? (
            <Notice
              tone="danger"
              title="Reading the syllabus failed"
              action={
                <form action={retryExtraction.bind(null, syllabusId)}>
                  <Button type="submit" size="sm" variant="outline">
                    <RotateCcw /> Try again
                  </Button>
                </form>
              }
            >
              {job?.lastError ?? "Unknown error"}
            </Notice>
          ) : job ? (
            <JobProgress jobId={job.id} label="Reading and structuring" />
          ) : null}
          <ul className="flex flex-col gap-1.5 text-sm">
            {syllabus.sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <FileText className="size-4 text-muted" aria-hidden />
                <span className="flex-1 truncate">{s.title}</span>
                <Badge tone={s.status === "READY" ? "success" : s.status === "FAILED" ? "danger" : s.status === "NEEDS_SETUP" ? "warning" : "neutral"}>
                  {s.status === "READY" ? "Read" : s.status === "FAILED" ? "Failed" : s.status === "NEEDS_SETUP" ? "Needs setup" : "Waiting"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const units: OutlineUnitInit[] = syllabus.units.map((u) => ({
    id: u.id,
    title: u.title,
    uncertain: u.uncertain,
    excerpt: u.sourceExcerpt,
    topics: u.topics.map((t) => ({ id: t.id, title: t.title, kind: t.kind, uncertain: t.uncertain, excerpt: t.sourceExcerpt })),
  }));
  const loose = syllabus.topics;
  if (loose.length) {
    units.push({
      id: null,
      title: "Ungrouped topics",
      uncertain: true,
      excerpt: null,
      topics: loose.map((t) => ({ id: t.id, title: t.title, kind: t.kind, uncertain: t.uncertain, excerpt: t.sourceExcerpt })),
    });
  }

  return (
    <div>
      {back}
      <PageHeader
        title={syllabus.status === "CONFIRMED" ? "Edit your syllabus" : "Check what NextChapter found"}
        description="Correct anything that's wrong, fix highlighted items, then confirm. Your roadmap is built only from what you confirm."
        actions={syllabus.extractionMethod ? <ExtractionBadge method={syllabus.extractionMethod} /> : null}
      />
      {syllabus.extractionNotes.length ? (
        <Notice tone="warning" title="Please double-check" className="mb-5">
          <ul className="list-disc space-y-1 pl-4">
            {syllabus.extractionNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <details open className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <summary className="cursor-pointer font-semibold">Your original ({syllabus.sources.length})</summary>
            <div className="mt-3 flex flex-col gap-3">
              {syllabus.sources.map((s) => {
                const id = fileId(s.fileKey);
                return (
                  <div key={s.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{s.title}</span>
                      {id ? (
                        <a className="shrink-0 text-primary underline-offset-4 hover:underline" href={`/api/files/${id}`} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : null}
                    </div>
                    {s.error ? <p className="text-xs text-danger">{s.error}</p> : null}
                    {s.kind === "IMAGE" && id ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route
                      <img src={`/api/files/${id}`} alt={`Original page: ${s.title}`} className="decorative w-full rounded-lg border border-border" loading="lazy" />
                    ) : null}
                  </div>
                );
              })}
              {syllabus.rawText ? (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">{syllabus.rawText}</pre>
              ) : null}
            </div>
          </details>
        </aside>
        <OutlineEditor
          syllabusId={syllabus.id}
          initialTitle={syllabus.title}
          initialUnits={units}
          initialAssessment={(syllabus.assessment as { label: string; detail: string; excerpt: string | null; uncertain: boolean }[] | null) ?? []}
        />
      </div>
    </div>
  );
}
