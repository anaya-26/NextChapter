import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, HelpCircle, MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { getOpportunity } from "@/server/services/opportunities";
import { APPLICATION_STATUSES, getApplication } from "@/server/services/applications";
import { listCvs } from "@/server/services/cv";
import { deadlineState } from "@/lib/opportunity-text";
import { localDateKey } from "@/lib/time";
import { AnalyseGapsButton, DeleteOpportunityButton, EditOpportunityButton, RequirementControls, SaveToggle, TrackerForm } from "@/components/opportunities/opportunity-ui";
import { DeadlineBadge, KIND_LABELS, MODE_LABELS, SOURCE_LABELS, VerificationBadge, readByLabel } from "@/components/opportunities/labels";
import { CreateCvForm } from "@/components/cv/cv-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel, DemoBadge, Notice, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Opportunity" };

const STATE_META = {
  MET: { label: "Shown", icon: CheckCircle2, tone: "success" as const },
  GAP: { label: "Gap", icon: CircleDashed, tone: "warning" as const },
  UNKNOWN: { label: "Check yourself", icon: HelpCircle, tone: "neutral" as const },
};

export default async function OpportunityPage(props: PageProps<"/goals/opportunities/[opportunityId]">) {
  const user = await requireUser();
  const { opportunityId } = await props.params;
  const { added } = await props.searchParams;
  const opp = await getOpportunity(user.id, opportunityId);
  if (!opp) notFound();
  const at = await now(user.id);
  const [profile, app, cvs] = await Promise.all([getProfile(user.id), getApplication(user.id, opp.id), listCvs(user.id)]);
  const tz = profile.timezone;
  const state = opp.isRecurring ? "UNKNOWN" : deadlineState(opp.deadline, at);
  const own = opp.ownerId === user.id;
  const readBy = readByLabel(opp.tags);
  const achievements = app?.requirements.some((r) => r.achievementIds.length)
    ? await prisma.achievement.findMany({ where: { userId: user.id, id: { in: app.requirements.flatMap((r) => r.achievementIds) } }, select: { id: true, title: true } })
    : [];
  const decidedBy = app?.requirements.find((r) => r.decidedBy !== "STUDENT")?.decidedBy;

  const facts: [string, string | null][] = [
    ["Eligibility", opp.eligibility],
    ["Education", opp.educationRequirements],
    ["Location", opp.location],
    ["Mode", MODE_LABELS[opp.workMode]],
    ["Duration", opp.duration],
    ["Stipend / pay (as published)", opp.compensation ?? "Not published"],
    ["Deadline", opp.deadline ? opp.deadline.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: tz }) : (opp.deadlineText ?? "Not stated")],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href={app ? "/goals/opportunities?view=saved" : "/goals/opportunities"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Opportunities
      </Link>
      {added && own ? (
        <Notice tone="success" title="Saved to your applications">
          {readBy && readBy !== "you" ? `Details were read by ${readBy}. ` : ""}Check them against the posting and correct anything that’s off.
          {opp.deadline ? " The deadline is in your calendar with a countdown." : " No deadline was found — add one if the posting states it."}
        </Notice>
      ) : null}

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{KIND_LABELS[opp.kind]}</Badge>
          <Badge tone="outline">{SOURCE_LABELS[opp.sourceType]}</Badge>
          {opp.isDemo ? <DemoBadge /> : null}
          {readBy === "Simulated AI" ? <AiLabel simulated kind="details read from your paste" /> : readBy === "AI" ? <AiLabel kind="Details read by AI" /> : null}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{opp.title}</h1>
          <p className="text-muted">{opp.organisation}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeadlineBadge deadline={opp.deadline} deadlineText={opp.deadlineText} state={state} tz={tz} />
          <VerificationBadge verification={opp.verification} lastCheckedAt={opp.lastCheckedAt} tz={tz} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={opp.sourceUrl} target="_blank" rel="noreferrer noopener">
              Open {opp.sourceName} <ExternalLink aria-hidden />
            </a>
          </Button>
          {opp.tags.includes("portal") ? null : <SaveToggle opportunityId={opp.id} saved={!!app} />}
          {own ? (
            <>
              <EditOpportunityButton
                id={opp.id}
                values={{ title: opp.title, organisation: opp.organisation, location: opp.location ?? "", compensation: opp.compensation ?? "", deadline: opp.deadline ? localDateKey(opp.deadline, tz) : "", requirements: opp.requirements }}
              />
              <DeleteOpportunityButton id={opp.id} />
            </>
          ) : null}
        </div>
      </header>

      {state === "CLOSED" || opp.verification === "EXPIRED" ? <Notice tone="warning">The deadline has passed. Programmes often reopen — check the official page for the next cycle.</Notice> : null}
      {opp.verification === "LINK_BROKEN" ? <Notice tone="warning">The source link didn’t open when Kadam last checked. The opening may have been removed — confirm before you spend time on it.</Notice> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            {opp.description && opp.sourceType !== "MANUAL" ? <p className="mb-4 whitespace-pre-line text-sm">{opp.description}</p> : null}
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) =>
                v ? (
                  <div key={k}>
                    <dt className="font-medium">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            {opp.description && opp.sourceType === "MANUAL" ? (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">Posting text you saved</summary>
                <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-muted">{opp.description}</p>
              </details>
            ) : null}
            {opp.sourceType === "DIRECTORY" ? <p className="mt-4 text-xs text-muted">Summary of a recurring programme, written from public information. Kadam hasn’t verified the current cycle — the official page is the source of truth.</p> : null}
          </Card>

          {app ? (
            <section>
              <SectionTitle action={opp.requirements.length || opp.eligibility ? <AnalyseGapsButton applicationId={app.id} again={app.requirements.length > 0} /> : null}>Your fit</SectionTitle>
              {app.requirements.length ? (
                <Card className="divide-y divide-border">
                  {decidedBy === "AI" || decidedBy === "MOCK" ? (
                    <div className="px-4 py-2">
                      <AiLabel simulated={decidedBy === "MOCK"} kind="AI comparison — your own choices override it" />
                    </div>
                  ) : null}
                  {app.requirements.map((r) => {
                    const meta = STATE_META[r.state];
                    return (
                      <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={meta.tone}>
                              <meta.icon aria-hidden /> {meta.label}
                            </Badge>
                            <p className="font-medium">{r.requirement}</p>
                          </div>
                          {r.explanation ? <p className="mt-1 text-sm text-muted">{r.explanation}</p> : null}
                          {r.achievementIds.length ? (
                            <p className="mt-1 text-xs">
                              Evidence:{" "}
                              {r.achievementIds.map((id, i) => (
                                <span key={id}>
                                  {i ? ", " : ""}
                                  <Link href={`/goals/portfolio/${id}`} className="text-primary hover:underline">
                                    {achievements.find((a) => a.id === id)?.title ?? "achievement"}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          ) : null}
                          {r.goal ? (
                            <p className="mt-1 text-xs">
                              Plan:{" "}
                              <Link href="/goals" className="text-primary hover:underline">
                                {r.goal.title}
                              </Link>
                            </p>
                          ) : null}
                        </div>
                        <RequirementControls checkId={r.id} state={r.state} hasGoal={!!r.goal} />
                      </div>
                    );
                  })}
                </Card>
              ) : opp.requirements.length || opp.eligibility ? (
                <Card className="p-4 text-sm text-muted">Compare this opening’s requirements with your approved portfolio. Studying a subject isn’t counted as showing it, and eligibility conditions are left for you to confirm.</Card>
              ) : (
                <Card className="p-4 text-sm text-muted">This listing doesn’t state requirements. {own ? "Use “Correct details” to add them from the posting." : "Check the official page for what they look for."}</Card>
              )}
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          {app ? (
            <>
              <Card className="p-4">
                <h2 className="mb-3 font-semibold">Application tracker</h2>
                <TrackerForm
                  applicationId={app.id}
                  statuses={APPLICATION_STATUSES}
                  cvs={cvs.map((c) => ({ id: c.id, title: c.title }))}
                  values={{ status: app.status, notes: app.notes ?? "", nextStep: app.nextStep ?? "", nextStepDate: app.nextStepAt ? app.nextStepAt.toISOString().slice(0, 10) : "", cvId: app.cvId ?? "" }}
                />
                {app.calendarEvents.length ? (
                  <div className="mt-4 border-t border-border pt-3 text-sm">
                    <p className="font-medium">In your calendar</p>
                    <ul className="mt-1 flex flex-col gap-1 text-muted">
                      {app.calendarEvents.map((e) => (
                        <li key={e.id}>
                          <Link href={`/calendar?date=${localDateKey(e.startAt, tz)}`} className="hover:text-fg hover:underline">
                            {e.startAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: tz })} — {e.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
              <Card className="flex flex-col gap-3 p-4">
                <h2 className="font-semibold">Prepare</h2>
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href={`/goals/interview?opportunity=${opp.id}`}>
                    <MessagesSquare /> Practise interview questions{app.interviewPractice.length ? ` (${app.interviewPractice.length} done)` : ""}
                  </Link>
                </Button>
                {app.cv ? (
                  <p className="text-sm">
                    CV: <Link href={`/goals/cv/${app.cv.id}`} className="text-primary hover:underline">{app.cv.title}</Link>
                  </p>
                ) : null}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Make a CV tailored to this</summary>
                  <div className="mt-3">
                    <CreateCvForm defaultTitle={`${opp.title}`.slice(0, 100)} targetOpportunityId={opp.id} />
                  </div>
                </details>
              </Card>
            </>
          ) : (
            <Card className="p-4 text-sm text-muted">Save this to track your application, add the deadline to your calendar, check your fit and prepare.</Card>
          )}
        </aside>
      </div>
    </div>
  );
}
