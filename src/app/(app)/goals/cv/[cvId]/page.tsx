import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { cvDocument } from "@/server/services/cv";
import { SECTION_LABELS } from "@/lib/cv-sections";
import { CvDocumentView } from "@/components/cv/cv-document";
import { CvDetailsForm, DeleteCvButton, PrintButton, ResetOverrideButton, SectionOrder, SuggestionButtons, TailorForm } from "@/components/cv/cv-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel, Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage(props: PageProps<"/goals/cv/[cvId]">) {
  const user = await requireUser();
  const { cvId } = await props.params;
  const doc = await cvDocument(user.id, cvId);
  if (!doc) notFound();
  const [achievements, education, saved, target] = await Promise.all([
    prisma.achievement.findMany({ where: { userId: user.id, approved: true }, select: { id: true, title: true, kind: true, skillsDemonstrated: true }, orderBy: { createdAt: "desc" } }),
    prisma.educationRecord.findMany({ where: { userId: user.id } }),
    prisma.application.findMany({ where: { userId: user.id }, include: { opportunity: { select: { id: true, title: true } } } }),
    doc.cv.targetOpportunityId ? prisma.opportunity.findFirst({ where: { id: doc.cv.targetOpportunityId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true, title: true } }) : null,
  ]);
  const titleOf = new Map(achievements.map((a) => [a.id, a.title]));
  const pending = doc.sections.pending;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/goals/cv" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> CVs
        </Link>
        <span className="flex-1" />
        <PrintButton />
        <Button asChild size="sm" variant="outline">
          <a href={`/api/cv/${doc.cv.id}/export?format=md`}>
            <Download /> Markdown
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/cv/${doc.cv.id}/export?format=txt`}>
            <Download /> Plain text
          </a>
        </Button>
        <DeleteCvButton id={doc.cv.id} />
      </div>
      <h1 className="text-2xl font-semibold print:hidden">{doc.cv.title}</h1>
      {doc.withdrawn.length ? <Notice tone="warning" className="print:hidden">Not shown because you edited or withdrew them (approve again to include): {doc.withdrawn.join(", ")}.</Notice> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] print:block">
        <div className="flex flex-col gap-4 print:hidden">
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Tailor</h2>
            {saved.length ? (
              <TailorForm cvId={doc.cv.id} opportunities={saved.map((a) => ({ id: a.opportunity.id, title: a.opportunity.title }))} current={target?.id ?? null} />
            ) : (
              <p className="text-sm text-muted">
                Save an opportunity first — <Link href="/goals/opportunities" className="underline">explore</Link>.
              </p>
            )}
            {target ? (
              <p className="text-sm">
                Tailored for <Link href={`/goals/opportunities/${target.id}`} className="text-primary hover:underline">{target.title}</Link>
              </p>
            ) : null}
            {doc.cv.tailoringNotes.length ? (
              <ul className="list-disc pl-5 text-sm text-muted">
                {doc.cv.tailoringNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {pending.length ? (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">Suggested wording</p>
                  <AiLabel simulated={pending[0].by === "MOCK"} kind="suggestions — checked against your record" />
                </div>
                {pending.map((p) => (
                  <div key={p.achievementId} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                    <p className="text-xs text-muted">{titleOf.get(p.achievementId)}</p>
                    <p>{p.bullet}</p>
                    <p className="text-xs text-muted">{p.reason}</p>
                    <SuggestionButtons cvId={doc.cv.id} achievementId={p.achievementId} />
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Section order</h2>
            <SectionOrder cvId={doc.cv.id} order={doc.order} labels={SECTION_LABELS} />
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Content</h2>
            <CvDetailsForm
              cvId={doc.cv.id}
              values={{ title: doc.cv.title, headline: doc.cv.headline ?? "", summary: doc.cv.summary ?? "", contactLine: doc.cv.contactLine ?? "", achievementIds: doc.sections.achievementIds, educationIds: doc.sections.educationIds, skills: doc.sections.skills }}
              achievements={achievements.map((a) => ({ id: a.id, title: a.title, kind: a.kind }))}
              education={education.map((e) => ({ id: e.id, line: `${e.qualification}, ${e.institution}` }))}
              skillSuggestions={[...new Set(achievements.flatMap((a) => a.skillsDemonstrated))]}
            />
          </Card>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted print:hidden">Preview — every line comes from your approved portfolio{Object.keys(doc.sections.bulletOverrides).length ? " (reworded lines you accepted are marked)" : ""}.</p>
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-border shadow-card print:border-0 print:shadow-none">
            <CvDocumentView doc={doc} renderEntryExtra={(e) => (e.tailored ? <ResetOverrideButton cvId={doc.cv.id} achievementId={e.id} /> : null)} />
          </div>
        </div>
      </div>
    </div>
  );
}
