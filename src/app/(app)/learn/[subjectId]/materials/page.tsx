import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileStack } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { listMaterials } from "@/server/services/sources";
import { formatTimestamp } from "@/lib/captions";
import { cn } from "@/lib/utils";
import { MaterialActions, PasteMaterialForm, RefreshWhileProcessing } from "@/components/learn/library-ui";
import { MaterialUploader } from "@/components/learn/material-uploader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Materials" };

const STATUS: Record<string, { tone: "success" | "info" | "warning" | "danger"; label: string }> = {
  READY: { tone: "success", label: "Ready" },
  PENDING: { tone: "info", label: "Waiting" },
  PROCESSING: { tone: "info", label: "Processing" },
  FAILED: { tone: "danger", label: "Failed" },
  NEEDS_SETUP: { tone: "warning", label: "Needs setup" },
};

function TopicChips({ topics, href, tone, className }: { topics: { id: string; title: string }[]; href: (id: string) => string; tone: "danger" | "warning"; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {topics.map((t) => (
        <li key={t.id}>
          <Link
            href={href(t.id)}
            className={cn(
              "inline-block rounded-full border px-2.5 py-0.5",
              tone === "danger" ? "border-danger/30 text-danger hover:bg-danger-soft" : "border-warning/30 text-warning hover:bg-warning-soft",
            )}
          >
            {t.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function size(bytes: number | null) {
  if (!bytes) return null;
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function MaterialsPage(props: PageProps<"/learn/[subjectId]/materials">) {
  const user = await requireUser();
  const { subjectId } = await props.params;
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: user.id } });
  if (!subject) notFound();
  const [materials, topics] = await Promise.all([
    listMaterials(user.id, subjectId),
    prisma.topic.findMany({
      where: { userId: user.id, syllabus: { subjectId, status: "CONFIRMED" }, status: { not: "SKIPPED" } },
      orderBy: { order: "asc" },
      select: { id: true, title: true, coverage: true, kind: true },
    }),
  ]);
  const e = env();
  const processing = materials.some((m) => m.status === "PENDING" || m.status === "PROCESSING");
  const titles = new Map(materials.map((m) => [m.id, m.title]));
  const required = topics.filter((t) => t.kind === "REQUIRED");
  const count = (c: string) => required.filter((t) => t.coverage === c).length;
  const missing = required.filter((t) => t.coverage === "MISSING");
  const partial = required.filter((t) => t.coverage === "PARTIAL");

  return (
    <div className="flex flex-col gap-5">
      <RefreshWhileProcessing active={processing} />
      <PageHeader
        eyebrow={
          <Link href={`/learn/${subjectId}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> {subject.name} · roadmap
          </Link>
        }
        title="Study materials"
        description="Your notes, slides, textbooks and recordings. Kadam compares them with your syllabus and uses them, with citations, when explaining topics."
      />

      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <MaterialUploader subjectId={subjectId} docMb={e.MAX_UPLOAD_MB} mediaMb={e.MAX_MEDIA_UPLOAD_MB} transcription={e.transcriptionConfigured} />
        <details>
          <summary className="cursor-pointer text-sm font-medium">Or paste text</summary>
          <div className="mt-3">
            <PasteMaterialForm subjectId={subjectId} />
          </div>
        </details>
      </Card>

      {required.length ? (
        <Card className="flex flex-col gap-3 p-4 sm:p-5">
          <SectionTitle>Syllabus coverage</SectionTitle>
          {materials.length ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-success-soft p-2 text-success">
                  <p className="text-lg font-semibold">{count("COVERED")}</p>
                  <p>Covered</p>
                </div>
                <div className="rounded-lg bg-warning-soft p-2 text-warning">
                  <p className="text-lg font-semibold">{count("PARTIAL")}</p>
                  <p>Partly</p>
                </div>
                <div className="rounded-lg bg-danger-soft p-2 text-danger">
                  <p className="text-lg font-semibold">{count("MISSING")}</p>
                  <p>Missing</p>
                </div>
              </div>
              <p className="text-xs text-muted">An estimate from matching each topic’s key words with your materials’ text — a topic described in different words may show as missing.</p>
              {missing.length ? (
                <div className="text-sm">
                  <p className="mb-1 font-medium">Not found in your materials — find resources:</p>
                  <TopicChips topics={missing.slice(0, 8)} href={(id) => `/learn/${subjectId}/topics/${id}?tab=resources`} tone="danger" />
                  {missing.length > 8 ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-muted">{missing.length - 8} more</summary>
                      <TopicChips topics={missing.slice(8)} href={(id) => `/learn/${subjectId}/topics/${id}?tab=resources`} tone="danger" className="mt-1.5" />
                    </details>
                  ) : null}
                </div>
              ) : null}
              {partial.length ? (
                <div className="text-sm">
                  <p className="mb-1 font-medium">Only partly covered:</p>
                  <TopicChips topics={partial} href={(id) => `/learn/${subjectId}/topics/${id}?tab=sources`} tone="warning" />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">Upload materials to see which syllabus topics they cover. You don’t need any to start — each topic can use general explanations and suggested resources.</p>
          )}
        </Card>
      ) : null}

      {materials.length ? (
        <Card className="divide-y divide-border">
          {materials.map((m) => {
            const st = STATUS[m.status];
            return (
              <div key={m.id} className="flex items-start gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/learn/sources/${m.id}`} className="font-medium hover:text-primary hover:underline">
                    {m.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span>{m.kind.toLowerCase()}</span>
                    {size(m.sizeBytes) ? <span>· {size(m.sizeBytes)}</span> : null}
                    {m.pageCount ? <span>· {m.pageCount} pages</span> : null}
                    {m.durationSec ? <span>· {formatTimestamp(m.durationSec)}</span> : null}
                    {m.status === "READY" && m._count.chunks ? (
                      <span>
                        · {m._count.chunks} passage{m._count.chunks === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {m.captionsForId ? <span>· captions for “{titles.get(m.captionsForId) ?? "a recording"}”</span> : null}
                  </div>
                  {m.status === "PROCESSING" || m.status === "PENDING" ? <Progress value={m.progress} className="mt-2 max-w-xs" label={`Processing ${m.title}`} /> : null}
                  {m.error ? <p className="mt-1 text-sm text-danger">{m.error}</p> : m.statusMessage && m.status === "READY" ? <p className="mt-1 text-xs text-muted">{m.statusMessage}</p> : null}
                </div>
                <MaterialActions id={m.id} canRetry={m.status === "FAILED" || m.status === "NEEDS_SETUP"} />
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState icon={FileStack} title="No materials yet" description="Upload class notes, slides, textbook PDFs, photos of pages, or lecture recordings with captions." />
      )}
    </div>
  );
}
