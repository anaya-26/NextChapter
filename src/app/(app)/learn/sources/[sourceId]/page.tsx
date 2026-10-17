import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { formatTimestamp } from "@/lib/captions";
import { SourceViewer, type ChunkView } from "@/components/learn/library-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Source" };

const METHOD: Record<string, string> = {
  text: "plain text",
  "pdf-text": "text read from the PDF",
  "docx-text": "text read from the document",
  "pptx-text": "text read from the slides",
  captions: "transcript from captions",
  transcription: "transcribed by a speech service",
  "local-ocr": "read with on-device text recognition — check for errors",
  "ai-vision": "read from the image by AI — check for errors",
};

export default async function SourcePage(props: PageProps<"/learn/sources/[sourceId]">) {
  const user = await requireUser();
  const { sourceId } = await props.params;
  const sp = await props.searchParams;
  const source = await prisma.source.findFirst({
    where: { id: sourceId, userId: user.id },
    include: { chunks: { orderBy: { ordinal: "asc" } }, subject: { select: { id: true, name: true } } },
  });
  if (!source) notFound();
  // A caption file's text lives on the recording it transcribes.
  const media = source.captionsForId ? await prisma.source.findFirst({ where: { id: source.captionsForId, userId: user.id }, select: { id: true, title: true } }) : null;
  const file = source.fileKey ? await prisma.storedFile.findFirst({ where: { key: source.fileKey, userId: user.id }, select: { id: true } }) : null;
  const fileUrl = file ? `/api/files/${file.id}` : null;

  const page = Number(sp.page) || null;
  const t = sp.t !== undefined && sp.t !== "" ? Number(sp.t) : null;
  const target =
    page != null
      ? source.chunks.find((c) => c.page === page)
      : t != null && Number.isFinite(t)
        ? (source.chunks.find((c) => c.startSec != null && c.startSec <= t && (c.endSec ?? Infinity) > t) ?? source.chunks.find((c) => c.startSec != null && c.startSec >= t))
        : null;
  const chunks: ChunkView[] = source.chunks.map((c) => ({ id: c.id, text: c.text, page: c.page, startSec: c.startSec, endSec: c.endSec, heading: c.heading }));
  const isMedia = source.kind === "AUDIO" || source.kind === "VIDEO";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          source.subject ? (
            <Link href={`/learn/${source.subject.id}/materials`} className="inline-flex items-center gap-1 hover:text-fg">
              <ArrowLeft className="size-3.5" aria-hidden /> {source.subject.name} · materials
            </Link>
          ) : (
            "Source"
          )
        }
        title={source.title}
        description={[
          source.kind.toLowerCase(),
          source.pageCount ? `${source.pageCount} pages` : null,
          source.durationSec ? formatTimestamp(source.durationSec) : null,
          source.extractionMethod ? (METHOD[source.extractionMethod] ?? source.extractionMethod) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          fileUrl ? (
            <>
              {!isMedia ? (
                <a href={`${fileUrl}${page ? `#page=${page}` : ""}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ExternalLink /> Open original{page ? ` at page ${page}` : ""}
                </a>
              ) : null}
              <a href={`${fileUrl}?download=1`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Download /> Download
              </a>
            </>
          ) : null
        }
      />
      {source.status !== "READY" ? (
        <Notice tone={source.status === "FAILED" || source.status === "NEEDS_SETUP" ? "warning" : "info"} title={source.status === "NEEDS_SETUP" ? "Needs setup" : source.status === "FAILED" ? "Couldn't read this file" : "Still processing"}>
          {source.error ?? source.statusMessage ?? "Its text will appear here when processing finishes."}
        </Notice>
      ) : source.statusMessage ? (
        <Notice tone="neutral">{source.statusMessage}</Notice>
      ) : null}
      {media ? (
        <Notice tone="info">
          These captions are the transcript of{" "}
          <Link href={`/learn/sources/${media.id}`} className="font-medium underline">
            {media.title}
          </Link>
          . Open the recording to jump to a timestamp.
        </Notice>
      ) : null}
      {source.kind === "IMAGE" && fileUrl ? (
        <Card className="overflow-hidden p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-only file */}
          <img src={fileUrl} alt={`Uploaded image: ${source.title}`} className="mx-auto max-h-[70vh] w-auto" />
        </Card>
      ) : null}
      {source.chunks.length ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Badge>
            {source.chunks.length} passage{source.chunks.length === 1 ? "" : "s"}
          </Badge>
          {target ? <span>Highlighted: the passage you followed a citation to.</span> : null}
        </div>
      ) : null}
      <SourceViewer
        media={isMedia && fileUrl ? { url: fileUrl, kind: source.kind as "AUDIO" | "VIDEO", mime: source.mimeType ?? "" } : null}
        chunks={chunks}
        targetId={target?.id ?? null}
        startAt={isMedia && t != null && Number.isFinite(t) ? t : null}
      />
    </div>
  );
}
