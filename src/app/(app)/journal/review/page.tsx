import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getPrivacy, getProfile } from "@/server/services/profile";
import { weekStats, type ReviewSummary } from "@/server/services/weekly-review";
import { openSuggestions } from "@/server/services/suggestions";
import { addDaysToKey, dateOnly, formatDuration, formatInTz, localDateKey, weekStartKey, zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";
import { GenerateReviewButton, SuggestionList } from "@/components/journal/journal-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiLabel, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { toSuggestionViews } from "../view";

export const metadata: Metadata = { title: "Weekly review" };

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export default async function WeeklyReviewPage(props: PageProps<"/journal/review">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [profile, privacy, at] = await Promise.all([getProfile(user.id), getPrivacy(user.id), now(user.id)]);
  const tz = profile.timezone;
  const thisWeek = weekStartKey(localDateKey(at, tz));
  const weeks = Array.from({ length: 6 }, (_, i) => addDaysToKey(thisWeek, -7 * i));
  const week = typeof sp.week === "string" && weeks.includes(sp.week) ? sp.week : thisWeek;
  const [stats, review] = await Promise.all([weekStats(user.id, week), prisma.weeklyReview.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart: dateOnly(week) } } })]);
  const suggestions = review ? await openSuggestions(user.id, { origin: "WEEKLY_REVIEW", sourceId: review.id }) : [];
  const summary = review?.summary as ReviewSummary | undefined;
  const label = (k: string) => `${formatInTz(zonedToUtc(k, "12:00", tz), tz, { day: "numeric", month: "short" })} – ${formatInTz(zonedToUtc(addDaysToKey(k, 6), "12:00", tz), tz, { day: "numeric", month: "short" })}`;

  const tiles = [
    { label: "Studied", value: formatDuration(stats.minutesActual), sub: stats.minutesPlanned ? `of ${formatDuration(stats.minutesPlanned)} planned` : "no plan" },
    { label: "Active days", value: String(stats.activeDays), sub: `${stats.sessionsCompleted} sessions done · ${stats.sessionsMissed} slipped` },
    { label: "Practice", value: pct(stats.accuracy), sub: `${stats.attempts} questions` },
    { label: "Recall at revision", value: pct(stats.avgRecall), sub: `${stats.revisionsDone} revisions · ${stats.cardsReviewed} cards` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Weekly review" description="A short look back at the week — what went well, patterns worth noticing, and a few small next steps." />
      <nav aria-label="Weeks" className="flex flex-wrap gap-1.5 text-sm">
        {weeks.map((k) => (
          <Link key={k} href={k === thisWeek ? "/journal/review" : `/journal/review?week=${k}`} aria-current={k === week ? "page" : undefined} className={cn("rounded-full px-3 py-1", k === week ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
            {k === thisWeek ? "This week" : label(k)}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-sm text-muted">{t.label}</p>
            <p className="text-2xl font-semibold">{t.value}</p>
            <p className="text-xs text-muted">{t.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle className="mb-0">{label(week)}</SectionTitle>
          <GenerateReviewButton weekKey={week} exists={!!review} />
        </div>
        {summary && review ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {review.generatedBy === "RULES" ? <Badge>Written from your numbers (no AI)</Badge> : <AiLabel simulated={review.generatedBy === "MOCK"} kind="AI review" />}
              <span>
                Used: this week’s study log, practice and revisions
                {review.usedEntryIds.length ? ` + ${review.usedEntryIds.length} journal entr${review.usedEntryIds.length === 1 ? "y" : "ies"} you shared` : privacy.aiUseJournal ? " (no journal entries were shared)" : " (journal access is off)"}
                .
              </span>
            </div>
            <section>
              <h3 className="mb-1 text-sm font-semibold">Highlights</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {summary.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </section>
            {summary.patterns.length ? (
              <section>
                <h3 className="mb-1 text-sm font-semibold">Patterns (tentative)</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {summary.patterns.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {summary.difficulties.length ? (
              <section>
                <h3 className="mb-1 text-sm font-semibold">Still tricky</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {summary.difficulties.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="rounded-lg bg-primary-soft/50 p-3 text-sm">{summary.encouragement}</p>
            {suggestions.length ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Small next steps</h3>
                <SuggestionList items={toSuggestionViews(suggestions)} />
              </section>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">No review for this week yet. It takes a few seconds and only uses what’s listed above{privacy.aiUseJournal ? " plus journal entries you chose to share" : ""}.</p>
        )}
      </Card>
    </div>
  );
}
