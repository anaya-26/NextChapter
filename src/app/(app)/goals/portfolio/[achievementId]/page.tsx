import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Share2 } from "lucide-react";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { ACHIEVEMENT_KINDS, getAchievement, skillsOverview } from "@/server/services/portfolio";
import { fileIds } from "@/app/(app)/journal/view";
import { AchievementForm, ApproveButton, DeleteAchievementButton, WithdrawButton } from "@/components/portfolio/portfolio-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge, Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Achievement" };

const month = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : "");

export default async function AchievementPage(props: PageProps<"/goals/portfolio/[achievementId]">) {
  const user = await requireUser();
  const { achievementId } = await props.params;
  const a = await getAchievement(user.id, achievementId);
  if (!a) notFound();
  const [files, skills, profile] = await Promise.all([fileIds(user.id, a.evidenceFileKeys), skillsOverview(user.id), getProfile(user.id)]);
  const kind = ACHIEVEMENT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind;
  const hasEvidence = a.evidenceLinks.length > 0 || files.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/goals/portfolio" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Portfolio
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{kind}</Badge>
          {a.approved ? <Badge tone="success">Approved — can appear in CVs</Badge> : <Badge tone="warning">Draft — not in CVs</Badge>}
          {a.isDemo ? <DemoBadge /> : null}
        </div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        {a.organisation || a.role ? <p className="text-muted">{[a.role, a.organisation].filter(Boolean).join(", ")}</p> : null}
      </header>

      {!a.approved ? (
        <Notice tone="info" title="Ready to approve?" action={<ApproveButton id={a.id} />}>
          Check the wording is accurate. {hasEvidence ? (profile.quietMode ? "" : "Approving with evidence earns 20 XP once.") : "Add a link or file as evidence to make it stronger (and earn XP)."}
        </Notice>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <p className="whitespace-pre-line">{a.description}</p>
        {a.outcomes ? <p className="whitespace-pre-line text-sm text-muted">Outcome: {a.outcomes}</p> : null}
        {a.skillsDemonstrated.length ? (
          <div className="flex flex-wrap gap-1.5">
            {a.skillsDemonstrated.map((s) => (
              <Badge key={s} tone="primary">
                {s}
              </Badge>
            ))}
          </div>
        ) : null}
        {hasEvidence ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">Evidence</p>
            {a.evidenceLinks.map((l) => (
              <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                {l.replace(/^https?:\/\//, "")} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ))}
            {files.map((f) => (
              <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <FileText className="size-3.5" aria-hidden /> Private file ({f.mimeType === "application/pdf" ? "PDF" : "image"})
              </a>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {a.approved ? <WithdrawButton id={a.id} /> : null}
          {a.approved ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/community/new?share=achievement:${a.id}`}>
                <Share2 /> Share to community
              </Link>
            </Button>
          ) : null}
          <DeleteAchievementButton id={a.id} redirectTo="/goals/portfolio" />
        </div>
      </Card>

      <details className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <summary className="cursor-pointer font-semibold">Edit</summary>
        <div className="mt-4">
          <AchievementForm
            id={a.id}
            kinds={ACHIEVEMENT_KINDS}
            skillSuggestions={skills.demonstrated.map((d) => d.skill)}
            values={{
              kind: a.kind,
              title: a.title,
              organisation: a.organisation ?? "",
              role: a.role ?? "",
              startMonth: month(a.startDate),
              endMonth: month(a.endDate),
              description: a.description,
              outcomes: a.outcomes ?? "",
              skills: a.skillsDemonstrated,
              subjects: a.subjectsRelated,
              evidenceLinks: a.evidenceLinks,
              files: files.map((f, i) => ({ key: f.key, id: f.id, name: `file ${i + 1}` })),
            }}
          />
        </div>
      </details>
    </div>
  );
}
