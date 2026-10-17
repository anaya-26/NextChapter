import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ExternalLink, Search } from "lucide-react";
import type { OpportunityKind, WorkMode } from "@/generated/prisma/client";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { listOpportunities } from "@/server/services/opportunities";
import { APPLICATION_STATUSES, listApplications } from "@/server/services/applications";
import { cn } from "@/lib/utils";
import { AddLinkButton, SaveToggle } from "@/components/opportunities/opportunity-ui";
import { DeadlineBadge, KIND_LABELS, MODE_LABELS, SOURCE_LABELS, VerificationBadge } from "@/components/opportunities/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge, EmptyState, Notice, PageHeader } from "@/components/ui/feedback";
import { Checkbox, Input, Select } from "@/components/ui/form";

export const metadata: Metadata = { title: "Opportunities" };

const STATUS_LABEL = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s.value, s.label]));

export default async function OpportunitiesPage(props: PageProps<"/goals/opportunities">) {
  const user = await requireUser();
  const at = await now(user.id);
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = one("view") === "saved" ? "saved" : "explore";
  const profile = await getProfile(user.id);
  const tz = profile.timezone;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Opportunities"
        description="Internships, scholarships, competitions and programmes, each with its source link, eligibility, published pay and deadline. Check details on the official page before applying."
        actions={<AddLinkButton />}
      />
      <nav aria-label="Opportunity views" className="flex gap-2 text-sm">
        {(["explore", "saved"] as const).map((v) => (
          <Link key={v} href={v === "saved" ? "/goals/opportunities?view=saved" : "/goals/opportunities"} aria-current={view === v ? "page" : undefined} className={cn("rounded-full px-3 py-1", view === v ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
            {v === "saved" ? "Saved & applications" : "Explore"}
          </Link>
        ))}
      </nav>
      {view === "saved" ? <SavedView userId={user.id} at={at} tz={tz} /> : <ExploreView userId={user.id} at={at} tz={tz} q={one("q")} kind={one("kind")} mode={one("mode")} allStages={one("all") === "1"} includeClosed={one("closed") === "1"} hasStage={!!profile.educationStage} />}
    </div>
  );
}

async function ExploreView({ userId, at, tz, q, kind, mode, allStages, includeClosed, hasStage }: { userId: string; at: Date; tz: string; q: string; kind: string; mode: string; allStages: boolean; includeClosed: boolean; hasStage: boolean }) {
  const items = await listOpportunities(userId, { q, kind: (kind in KIND_LABELS ? kind : "") as OpportunityKind | "", mode: (mode in MODE_LABELS ? mode : "") as WorkMode | "", allStages, includeClosed }, at);
  return (
    <>
      <form className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:flex sm:flex-wrap sm:items-end" role="search">
        <label className="col-span-2 flex flex-col gap-1 text-sm font-medium sm:flex-1">
          Search
          <Input name="q" defaultValue={q} placeholder="e.g. research, Pune, scholarship" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Type
          <Select name="kind" defaultValue={kind}>
            <option value="">All types</option>
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Mode
          <Select name="mode" defaultValue={mode}>
            <option value="">Any</option>
            <option value="REMOTE">Remote</option>
            <option value="ONSITE">On-site</option>
            <option value="HYBRID">Hybrid</option>
          </Select>
        </label>
        <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1.5 sm:flex-col">
          <Checkbox name="all" value="1" defaultChecked={allStages} label="Outside my education stage" />
          <Checkbox name="closed" value="1" defaultChecked={includeClosed} label="Include closed" />
        </div>
        <Button type="submit" variant="outline" className="col-span-2 sm:col-auto">
          <Search /> Filter
        </Button>
      </form>
      {!hasStage ? (
        <Notice tone="info">
          Add your education stage in <Link href="/settings">Settings</Link> so Kadam can show what fits you.
        </Notice>
      ) : null}
      {items.length ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((o) => (
            <li key={o.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="primary">{KIND_LABELS[o.kind]}</Badge>
                  <Badge tone="outline">{SOURCE_LABELS[o.sourceType]}</Badge>
                  {o.isPortal ? <Badge tone="outline">Portal — many openings</Badge> : null}
                  {o.isDemo ? <DemoBadge /> : null}
                  {o.application ? <Badge tone="success">{STATUS_LABEL[o.application.status]}</Badge> : null}
                </div>
                <div>
                  <Link href={`/goals/opportunities/${o.id}`} className="font-semibold hover:text-primary hover:underline">
                    {o.title}
                  </Link>
                  <p className="text-sm text-muted">{o.organisation}</p>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="sr-only">Where</dt>
                    <dd className="text-muted">
                      {o.location ?? "Location not stated"} · {MODE_LABELS[o.workMode]}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">Pay</dt>
                    <dd className="text-muted">{o.compensation ?? "Pay not published"}</dd>
                  </div>
                </dl>
                {o.reasons.length ? <p className="text-xs text-success">{o.reasons.join(" · ")}</p> : null}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <DeadlineBadge deadline={o.deadline} deadlineText={o.deadlineText} state={o.deadlineState} tz={tz} />
                  <VerificationBadge verification={o.verification} lastCheckedAt={o.lastCheckedAt} tz={tz} />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <a href={o.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    {o.sourceName} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                  <span className="flex-1" />
                  {o.isPortal ? null : <SaveToggle opportunityId={o.id} saved={!!o.application} />}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/goals/opportunities/${o.id}`}>Details</Link>
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Briefcase} title="Nothing matches these filters" description="Try fewer filters, include other education stages, or save a link you found yourself." action={<AddLinkButton />} />
      )}
      <p className="text-xs text-muted">
        The official directory is a short, hand-checked list of recurring government and well-known programmes — not live openings. Dates and amounts change every cycle, so Kadam links to the official page and shows when each link was last checked. Private portals such as Internshala and Unstop have no public feed, so Kadam doesn’t copy their listings: save any posting you like with “Add a link”.
      </p>
    </>
  );
}

async function SavedView({ userId, at, tz }: { userId: string; at: Date; tz: string }) {
  const apps = await listApplications(userId, at);
  if (!apps.length) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No saved opportunities yet"
        description="Save one from Explore or add a link you found. Kadam adds its deadline to your calendar, checks your fit and helps you prepare."
        action={
          <Button asChild variant="outline">
            <Link href="/goals/opportunities">Explore opportunities</Link>
          </Button>
        }
      />
    );
  }
  const groups = APPLICATION_STATUSES.map((s) => ({ ...s, items: apps.filter((a) => a.status === s.value) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.value} aria-labelledby={`grp-${g.value}`}>
          <h2 id={`grp-${g.value}`} className="mb-2 text-sm font-semibold text-muted">
            {g.label} · {g.items.length}
          </h2>
          <Card className="divide-y divide-border">
            {g.items.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/goals/opportunities/${a.opportunityId}`} className="font-medium hover:text-primary hover:underline">
                    {a.opportunity.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {a.opportunity.organisation}
                    {a.nextStep ? ` · Next: ${a.nextStep}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.opportunity.isDemo ? <DemoBadge /> : null}
                  {a.met + a.gaps ? <Badge tone={a.gaps ? "warning" : "success"}>{a.gaps ? `${a.gaps} gap${a.gaps === 1 ? "" : "s"}` : "No gaps"}</Badge> : <Badge tone="outline">Fit not checked</Badge>}
                  <DeadlineBadge deadline={a.opportunity.deadline} deadlineText={a.opportunity.deadlineText} state={a.deadlineState} tz={tz} />
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
