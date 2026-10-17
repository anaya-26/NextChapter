import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { listCvs } from "@/server/services/cv";
import { CreateCvForm } from "@/components/cv/cv-ui";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "CV" };

export default async function CvListPage() {
  const user = await requireUser();
  const [cvs, approved, saved, profile] = await Promise.all([
    listCvs(user.id),
    prisma.achievement.count({ where: { userId: user.id, approved: true } }),
    prisma.application.findMany({ where: { userId: user.id }, include: { opportunity: { select: { id: true, title: true } } }, orderBy: { updatedAt: "desc" } }),
    getProfile(user.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="CV" description="Built only from your approved achievements, education and the skills they show. Tailoring reorders and rephrases — it never adds anything you haven’t done." />
      {!approved ? (
        <Notice tone="info" title="Start with your portfolio">
          A CV needs at least one approved achievement. <Link href="/goals/portfolio/new">Add one</Link> — a project, role, competition or certificate.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section>
          <SectionTitle>Your CVs</SectionTitle>
          {cvs.length ? (
            <Card className="divide-y divide-border">
              {cvs.map((c) => (
                <Link key={c.id} href={`/goals/cv/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
                  <FileText className="size-5 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted">
                      Updated {c.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: profile.timezone })}
                      {c.lastExportedAt ? ` · exported ${c.lastExportedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: profile.timezone })}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-muted">No CVs yet. Make a general one first, then tailored copies for specific openings.</Card>
          )}
        </section>
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">New CV</h2>
          <CreateCvForm defaultTitle={cvs.length ? "" : "General"} opportunities={saved.map((a) => ({ id: a.opportunity.id, title: a.opportunity.title }))} />
        </Card>
      </div>
    </div>
  );
}
