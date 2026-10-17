import type { Metadata } from "next";
import { Compass, FlaskConical, Info } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { listCareerInterests } from "@/server/services/goals";
import { DISCOVERY_ACTIVE_DAYS, DISCOVERY_SPAN_DAYS, engagement, latestReview, type Possibility } from "@/server/services/career";
import { pathFor } from "@/lib/domain-paths";
import { InterestCard, InterestForm } from "@/components/goals/career-interest-ui";
import { CareerReviewButton, CompleteExplorationForm, CreateDomainGoalButton, ReviewFeedbackForm, StartExplorationButton } from "@/components/goals/discovery-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiLabel, EmptyState, Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Career" };

const KIND_LABEL: Record<string, string> = {
  MINI_PROJECT: "Mini project",
  SIMULATION: "Simulation (a learning activity, not work experience)",
  INFORMATIONAL_INTERVIEW: "Talk to someone in the field",
  READING: "Reading",
  SHADOWING: "Shadowing",
  COURSE: "Short course",
};

export default async function CareerPage() {
  const user = await requireUser();
  const at = await now(user.id);
  const [interests, profile, eng, review, explorations] = await Promise.all([
    listCareerInterests(user.id),
    getProfile(user.id),
    engagement(user.id, at),
    latestReview(user.id),
    prisma.explorationProject.findMany({ where: { userId: user.id, status: { in: ["ACTIVE", "PROPOSED", "COMPLETED"] } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const clear = profile.careerClarity === "CLEAR";
  const selected = interests.filter((i) => i.status === "SELECTED");
  const possibilities = (review?.suggestions as unknown as Possibility[] | undefined) ?? [];
  const summary = (review?.evidence as { summary?: string; used?: string[] } | undefined) ?? {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Career"
        description={
          clear
            ? "You know your direction — turn it into skills, projects and roles to work towards, and save target companies and cities so opportunities match."
            : "Not knowing yet is normal. Explore with small projects; after about three months of real work, NextChapter offers an evidence-based discovery review."
        }
      />

      {selected.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Your direction{selected.length > 1 ? "s" : ""}</h2>
          {selected.map((i) => {
            const path = pathFor(i.domain);
            if (!path) return null;
            return (
              <Card key={i.id} className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-semibold">{path.domain}</p>
                  <Badge>General starting points — not personalised advice</Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-medium">Skills to build</p>
                    <ul className="list-disc pl-5 text-muted">{path.skills.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-medium">Projects to start with</p>
                    <ul className="list-disc pl-5 text-muted">{path.starterProjects.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-medium">Roles to look at</p>
                    <ul className="list-disc pl-5 text-muted">{path.roles.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-medium">Ways in (courses, exams, internships)</p>
                    <ul className="list-disc pl-5 text-muted">{path.entryRoutes.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CreateDomainGoalButton domain={path.domain} />
                  <StartExplorationButton domain={path.domain} label={`Try: ${path.exploration.title}`} />
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Compass className="size-4 text-primary" aria-hidden /> Discovery review
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm">
              {Math.min(eng.spanDays, DISCOVERY_SPAN_DAYS)} of {DISCOVERY_SPAN_DAYS} days since you started
            </p>
            <Progress value={Math.min(100, (eng.spanDays / DISCOVERY_SPAN_DAYS) * 100)} label="Days since you started" className="mt-1" />
          </div>
          <div>
            <p className="text-sm">
              {Math.min(eng.activeDays, DISCOVERY_ACTIVE_DAYS)} of {DISCOVERY_ACTIVE_DAYS} active days
            </p>
            <Progress value={Math.min(100, (eng.activeDays / DISCOVERY_ACTIVE_DAYS) * 100)} label="Active days" className="mt-1" />
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Missing days never resets anything — active days simply add up.{eng.demoDays ? ` ${eng.demoDays} active days are labelled demo data.` : ""}
        </p>
        {eng.eligible ? (
          <CareerReviewButton label={review?.kind === "DISCOVERY" ? "Refresh my discovery review" : "Get my discovery review"} />
        ) : eng.canPreview ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">The full review needs more history. You can get preliminary findings now — clearly marked as early.</p>
            <CareerReviewButton label="Get preliminary findings" />
          </div>
        ) : (
          <p className="text-sm text-muted">Use NextChapter on a few more days to unlock even preliminary findings.</p>
        )}
      </Card>

      {review ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={review.kind === "DISCOVERY" ? "primary" : "warning"}>{review.kind === "DISCOVERY" ? "Full discovery review" : "Preliminary findings"}</Badge>
            {review.generatedBy === "RULES" ? <Badge>From your evidence (no AI)</Badge> : <AiLabel simulated={review.generatedBy === "MOCK"} kind="AI review" />}
            <span className="text-xs text-muted">
              {review.engagementDays} active days over {review.spanDays} days{summary.used?.length ? ` · used: ${summary.used.join("; ")}` : ""}
            </span>
          </div>
          {summary.summary ? <p>{summary.summary}</p> : null}
          {possibilities.length ? (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {possibilities.map((p, i) => (
                <li key={p.title} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm">{p.whyItFits}</p>
                  <div className="text-sm">
                    <p className="font-medium">Evidence</p>
                    <ul className="list-disc pl-5 text-muted">{p.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">What’s uncertain</p>
                    <ul className="list-disc pl-5 text-muted">{p.uncertainties.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                  <p className="text-sm text-muted">{p.nextStep}</p>
                  <div className="mt-auto rounded-lg bg-surface-2 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium">
                      <FlaskConical className="size-4 text-primary" aria-hidden /> {p.explorationProject.title}
                    </p>
                    <p className="text-xs text-muted">{KIND_LABEL[p.explorationProject.kind] ?? p.explorationProject.kind}</p>
                    <ol className="mt-1 list-decimal pl-5">{p.explorationProject.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    <div className="mt-2">
                      <StartExplorationButton reviewId={review.id} index={i} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not enough evidence yet for specific suggestions. Try an exploration below, or add domains you’re curious about.</p>
          )}
          {review.limitations.length ? (
            <Notice tone="neutral" title="Limits of this review">
              <ul className="list-disc pl-5">{review.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </Notice>
          ) : null}
          <ReviewFeedbackForm reviewId={review.id} existing={review.studentFeedback} />
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Explorations</h2>
        {explorations.length ? (
          explorations.map((e) => (
            <Card key={e.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{e.title}</p>
                <Badge tone={e.status === "COMPLETED" ? "success" : "info"}>{e.status === "COMPLETED" ? "Done" : "In progress"}</Badge>
                {e.domain ? <Badge>{e.domain}</Badge> : null}
              </div>
              <p className="text-xs text-muted">{KIND_LABEL[e.kind] ?? e.kind}</p>
              <ol className="list-decimal pl-5 text-sm">{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {e.status === "COMPLETED" ? <p className="text-sm">“{e.reflection}”</p> : <CompleteExplorationForm id={e.id} />}
            </Card>
          ))
        ) : (
          <EmptyState icon={FlaskConical} title="No explorations yet" description="Small, real experiences are the best evidence about what you might enjoy." />
        )}
      </section>

      <Card className="p-5 sm:p-6">
        <SectionTitle>Add a domain or direction</SectionTitle>
        <InterestForm />
      </Card>
      {interests.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {interests.map((i) => (
            <InterestCard key={i.id} interest={{ id: i.id, domain: i.domain, roles: i.roles, companies: i.companies, cities: i.cities, workModes: i.workModes, status: i.status, notes: i.notes }} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Compass} title="No career interests yet" description="Add one domain — even a vague one like “something with computers and people”." />
      )}
    </div>
  );
}
