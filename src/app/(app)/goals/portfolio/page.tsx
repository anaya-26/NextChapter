import type { Metadata } from "next";
import Link from "next/link";
import { Award, FileText, Link2, Plus } from "lucide-react";
import { requireUser } from "@/server/session";
import { ACHIEVEMENT_KINDS, achievementSuggestions, listAchievements, listEducation, skillsOverview } from "@/server/services/portfolio";
import { DeleteEducationButton, EducationDialog } from "@/components/portfolio/portfolio-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge, EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Portfolio" };

const KIND_LABEL = Object.fromEntries(ACHIEVEMENT_KINDS.map((k) => [k.value, k.label]));

export default async function PortfolioPage() {
  const user = await requireUser();
  const [achievements, education, suggestions, skills] = await Promise.all([listAchievements(user.id), listEducation(user.id), achievementSuggestions(user.id), skillsOverview(user.id)]);
  const drafts = achievements.filter((a) => !a.approved);
  const approved = achievements.filter((a) => a.approved);

  const row = (a: (typeof achievements)[number]) => (
    <Link key={a.id} href={`/goals/portfolio/${a.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{a.title}</p>
        <p className="truncate text-sm text-muted">{a.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{KIND_LABEL[a.kind]}</Badge>
        {a.evidenceLinks.length || a.evidenceFileKeys.length ? (
          <Badge tone="success">
            {a.evidenceLinks.length ? <Link2 aria-hidden /> : <FileText aria-hidden />} Evidence
          </Badge>
        ) : (
          <Badge tone="warning">No evidence yet</Badge>
        )}
        {a.isDemo ? <DemoBadge /> : null}
      </div>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Portfolio"
        description="What you’ve shown — projects, roles, competitions and certificates — with evidence. Only entries you approve appear in your CVs."
        actions={
          <Button asChild>
            <Link href="/goals/portfolio/new">
              <Plus /> Add achievement
            </Link>
          </Button>
        }
      />

      {drafts.length ? (
        <section>
          <SectionTitle>Waiting for your approval</SectionTitle>
          <Card className="divide-y divide-border">{drafts.map(row)}</Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>Approved</SectionTitle>
        {approved.length ? (
          <Card className="divide-y divide-border">{approved.map(row)}</Card>
        ) : (
          <EmptyState icon={Award} title="Nothing approved yet" description="Add a project, a responsibility, a competition or a certificate. Small things count — a working script, a club event you ran, a lab write-up." />
        )}
      </section>

      {suggestions.length ? (
        <section>
          <SectionTitle>From elsewhere in Kadam</SectionTitle>
          <Card className="divide-y divide-border">
            {suggestions.map((s) => (
              <div key={s.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.label}</p>
                  {s.detail ? <p className="line-clamp-2 text-sm text-muted">{s.detail}</p> : null}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/goals/portfolio/new?from=${encodeURIComponent(s.key)}`}>Turn into an achievement</Link>
                </Button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Shown vs studied</h2>
          <p className="mb-3 text-sm text-muted">Employers and selectors look for what you’ve shown. Studying counts towards learning — not as a demonstrated skill.</p>
          <p className="text-sm font-medium">Shown in your approved work</p>
          {skills.demonstrated.length ? (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {skills.demonstrated.map((d) => (
                <li key={d.skill}>
                  <Badge tone="success" title={`Shown in: ${d.from.join(", ")}`}>
                    {d.skill}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing yet.</p>
          )}
          <p className="mt-4 text-sm font-medium">Studied, not yet shown</p>
          {skills.studied.filter((s) => !s.shown).length ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm text-muted">
              {skills.studied
                .filter((s) => !s.shown)
                .map((s) => (
                  <li key={s.name}>
                    {s.name} — {Math.round(s.minutes / 60)} h studied{s.topicsStudied ? `, ${s.topicsStudied} topics` : ""}. A small project would show it.
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing here.</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Gaps for your directions</h2>
          <p className="mb-3 text-sm text-muted">General skills for the directions you’re considering that your portfolio doesn’t show yet, with starter projects.</p>
          {skills.directions.length ? (
            <div className="flex flex-col gap-4">
              {skills.directions.map((d) => (
                <div key={d.domain} className="text-sm">
                  <p className="font-medium">{d.domain}</p>
                  {d.missing.length ? <ul className="list-disc pl-5 text-muted">{d.missing.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-muted">Your portfolio touches every general skill listed.</p>}
                  <p className="mt-1 text-xs">Project ideas: {d.projects.join(" · ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Add a direction in <Link href="/goals/career" className="underline">Career</Link> to see gaps.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle action={<EducationDialog id={null} />}>Education</SectionTitle>
        {education.length ? (
          <Card className="divide-y divide-border">
            {education.map((e) => (
              <div key={e.id} className="flex items-center gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.qualification}</p>
                  <p className="text-sm text-muted">
                    {e.institution}
                    {e.board ? ` · ${e.board}` : ""}
                    {e.current ? ` · ${e.startYear ?? ""}${e.startYear ? "–" : ""}present` : e.startYear || e.endYear ? ` · ${[e.startYear, e.endYear].filter(Boolean).join("–")}` : ""}
                    {e.result ? ` · ${e.result}` : ""}
                  </p>
                </div>
                <EducationDialog id={e.id} values={{ qualification: e.qualification, institution: e.institution, board: e.board ?? "", startYear: e.startYear ? String(e.startYear) : "", endYear: e.endYear ? String(e.endYear) : "", current: e.current, result: e.result ?? "" }} />
                <DeleteEducationButton id={e.id} />
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted">Add your school and college so CVs can include them.</Card>
        )}
      </section>
    </div>
  );
}
