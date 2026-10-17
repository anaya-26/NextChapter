import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, ExternalLink } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { cn, hostOf } from "@/lib/utils";
import { LearnTabs } from "@/components/learn/learn-tabs";
import { AddResourceForm, ResourceFlags } from "@/components/learn/workspace-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiLabel, EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Saved resources" };

const COST: Record<string, string> = { FREE: "Free", FREEMIUM: "Free + paid parts", PAID: "Paid", UNKNOWN: "Cost unknown" };

export default async function ResourcesPage(props: PageProps<"/learn/resources">) {
  const user = await requireUser();
  const { show } = await props.searchParams;
  const all = show === "all";
  const resources = await prisma.resource.findMany({
    where: { userId: user.id, dismissed: false, ...(all ? {} : { saved: true }) },
    orderBy: [{ subjectId: "asc" }, { createdAt: "desc" }],
    include: {
      topic: { select: { id: true, title: true } },
      subject: { select: { id: true, name: true } },
    },
  });
  const groups = new Map<string, { name: string; items: typeof resources }>();
  for (const r of resources) {
    const key = r.subject?.id ?? "none";
    const g = groups.get(key) ?? { name: r.subject?.name ?? "Not linked to a subject", items: [] };
    g.items.push(r);
    groups.set(key, g);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Learn" description="Readings, videos and open textbooks you've saved. Links found by AI search show when they were last checked." />
      <LearnTabs />
      <div className="flex gap-2 text-sm">
        <Link href="/learn/resources" className={cn("rounded-full px-3 py-1", !all ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Saved
        </Link>
        <Link href="/learn/resources?show=all" className={cn("rounded-full px-3 py-1", all ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
          Everything found
        </Link>
      </div>
      {groups.size ? (
        [...groups.entries()].map(([key, g]) => (
          <section key={key}>
            <SectionTitle>{g.name}</SectionTitle>
            <Card className="divide-y divide-border">
              {g.items.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                      {r.title} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                    <p className="text-xs text-muted">
                      {r.provider ?? hostOf(r.url)}
                      {r.topic && r.subject ? (
                        <>
                          {" · for "}
                          <Link href={`/learn/${r.subject.id}/topics/${r.topic.id}?tab=resources`} className="text-primary hover:underline">
                            {r.topic.title}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.origin === "AI_WEB_SEARCH" || r.origin === "MOCK" ? <AiLabel simulated={r.origin === "MOCK"} kind="Found by AI web search" /> : r.origin === "STUDENT" ? <Badge>Saved by you</Badge> : null}
                      <Badge tone={r.cost === "FREE" ? "success" : r.cost === "PAID" ? "warning" : "neutral"}>{COST[r.cost]}</Badge>
                      {r.linkStatus === "UNREACHABLE" ? <Badge tone="danger">Link didn’t respond</Badge> : null}
                    </div>
                  </div>
                  <ResourceFlags id={r.id} saved={r.saved} />
                </div>
              ))}
            </Card>
          </section>
        ))
      ) : (
        <EmptyState icon={Bookmark} title={all ? "No resources yet" : "Nothing saved yet"} description="Open a topic's Resources tab to find readings and videos, then bookmark the useful ones." />
      )}
      <Card className="p-4 sm:p-5">
        <SectionTitle>Save a link</SectionTitle>
        <AddResourceForm topicId={null} subjectId={null} />
      </Card>
    </div>
  );
}
