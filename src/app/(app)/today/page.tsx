import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, Layers, LifeBuoy, Play, PartyPopper, Sparkles, Star, Timer } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getPrivacy, getProfile, profileCompleteness } from "@/server/services/profile";
import { todayOverview } from "@/server/services/today";
import { OBSTACLE_REASONS } from "@/server/services/sessions";
import { DAY_PARTS } from "@/lib/planner";
import { formatDuration, formatInTz, localTimeKey, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { startFocusAction, startSessionAction } from "../calendar/actions";
import { KIND_META } from "@/components/calendar/kinds";
import { LogStudyForm, ObstacleForm } from "@/components/calendar/planning-ui";
import { CheckInCard, MoodDot } from "@/components/journal/journal-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage(props: PageProps<"/today">) {
  const user = await requireUser();
  const { welcome, restarted } = await props.searchParams;
  const t = await getTranslations("today");
  const [profile, at] = await Promise.all([getProfile(user.id), now(user.id)]);
  const o = await todayOverview(user.id, at);
  const tz = o.tz;
  const hour = zonedParts(at, tz).hour;
  const name = profile.displayName ?? user.name.split(" ")[0];
  const greeting = hour < 12 ? t("greetingMorning", { name }) : hour < 17 ? t("greetingAfternoon", { name }) : t("greetingEvening", { name });
  const completeness = profileCompleteness(profile);
  const priority = await prisma.goal.findFirst({ where: { userId: user.id, isCurrentPriority: true, status: "ACTIVE" } });
  const [privacy, checkedIn] = await Promise.all([
    getPrivacy(user.id),
    prisma.journalEntry.findFirst({ where: { userId: user.id, kind: "CHECK_IN", date: new Date(`${o.todayKey}T00:00:00Z`) }, orderBy: { createdAt: "desc" }, select: { id: true, mood: true } }),
  ]);
  const topics = await prisma.topic.findMany({
    where: { userId: user.id, syllabus: { status: "CONFIRMED", subject: { status: "ACTIVE" } }, status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
    orderBy: [{ status: "asc" }, { order: "asc" }],
    take: 30,
    select: { id: true, title: true, syllabus: { select: { subject: { select: { name: true } } } } },
  });
  const time = (d: Date) => formatInTz(d, tz, { hour: "numeric", minute: "2-digit" });
  const p = o.primary;
  const loadPct = o.load.plannedMinutes ? Math.round((o.load.doneMinutes / o.load.plannedMinutes) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={greeting} description={formatInTz(at, tz, { weekday: "long", day: "numeric", month: "long" })} />

      {welcome ? (
        <Card className="flex items-start gap-3 border-primary/40 bg-primary-soft/50 p-5">
          <Sparkles className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">You&apos;re set up!</p>
            <p className="text-sm text-muted">Next: add a syllabus in Learn so NextChapter can build your roadmap.</p>
          </div>
        </Card>
      ) : null}
      {o.welcomeBack ? (
        <Notice tone="success" title={t("welcomeBack")}>
          <span className="inline-flex items-center gap-1">
            <PartyPopper className="size-4" aria-hidden /> {profile.quietMode ? "" : "+15 XP for coming back. "}One small session today is a great restart.
          </span>
        </Notice>
      ) : null}
      {restarted ? <Notice tone="success" title="Fresh plan ready">Your calendar has a lighter plan now. Start with the first session below.</Notice> : null}

      {/* The one clear next action */}
      <Card className="flex flex-col gap-3 border-primary/30 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("upNext")}</p>
          <p className="mt-0.5 text-lg font-semibold">{p.title}</p>
          <p className="text-sm text-muted">{p.detail}</p>
        </div>
        {p.type === "CONTINUE" ? (
          <Link href={p.href} className={buttonVariants({ size: "lg" })}>
            <Timer /> Continue
          </Link>
        ) : p.type === "START_SESSION" ? (
          <form action={startSessionAction.bind(null, p.sessionId)}>
            <SubmitButton size="lg">
              <Play /> {t("startNow")}
            </SubmitButton>
          </form>
        ) : p.type === "LINK" ? (
          <Link href={p.href} className={buttonVariants({ size: "lg" })}>
            {p.label} <ArrowRight />
          </Link>
        ) : (
          <Link href={p.title.startsWith("Plan") ? "/calendar/plan" : "/learn"} className={buttonVariants({ size: "lg" })}>
            {p.title.startsWith("Plan") ? "Plan my week" : "Go to Learn"} <ArrowRight />
          </Link>
        )}
      </Card>

      {o.obstacle ? (
        <Card className="flex flex-col gap-3 border-warning/40 p-5">
          <div>
            <p className="font-semibold">{o.obstacle.title}</p>
            <p className="text-sm text-muted">{o.obstacle.reason} That’s a signal about the plan, not about you. What would help?</p>
          </div>
          <ObstacleForm actionId={o.obstacle.id} part={(o.obstacle.payload as { part: string }).part} reasons={OBSTACLE_REASONS} parts={DAY_PARTS.map((d) => ({ id: d.id, label: d.label }))} />
        </Card>
      ) : null}

      {o.restart ? (
        <Notice
          tone="info"
          title={o.restart.daysAway >= 5 ? "Ready for a fresh start?" : "Things have piled up a bit"}
          action={
            <Link href="/calendar/restart" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <LifeBuoy /> See restart options
            </Link>
          }
        >
          {[
            o.restart.missedSessions ? `${o.restart.missedSessions} sessions slipped` : null,
            o.restart.overdueRevisions.length ? `${o.restart.overdueRevisions.length} revisions are overdue` : null,
            o.restart.daysAway >= 5 ? `${o.restart.daysAway} days since your last activity` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          . A lighter plan can get you moving again.
        </Notice>
      ) : null}

      {o.upcoming.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Countdowns">
          {o.upcoming.slice(0, 4).map((c) => (
            <Link key={c.key} href={c.href} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm", c.kind === "EXAM" ? "border-danger/30 bg-danger-soft text-danger" : "border-accent/40 bg-accent-soft text-accent-soft-fg")}>
              <CalendarClock className="size-4" aria-hidden />
              <span className="font-medium">{c.title}</span>
              <span>{c.daysLeft === 0 ? "today" : c.daysLeft === 1 ? "tomorrow" : `in ${c.daysLeft} days`}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <SectionTitle action={<Link href="/calendar" className="text-sm font-medium text-primary hover:underline">Calendar</Link>}>{t("priorities")}</SectionTitle>
          {o.priorities.length ? (
            <ul className="flex flex-col gap-2">
              {o.priorities.map((i) => {
                const meta = KIND_META[i.kind] ?? KIND_META.PERSONAL;
                const href = i.session ? `/study/${i.session.id}` : i.topic ? `/learn/${i.topic.subjectId}/topics/${i.topic.id}` : `/calendar?date=${o.todayKey}`;
                return (
                  <li key={i.key}>
                    <Link href={href} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary">
                      <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.title}</span>
                        <span className="block text-xs text-muted">
                          {i.allDay ? "Today" : i.isDeadline ? `Due ${formatInTz(i.start, tz, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : `${time(i.start)}–${time(i.end)}`} · {meta.label}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-muted" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("nothingPlanned")}. <Link href="/calendar/plan" className="font-medium text-primary underline">Plan study time</Link> or add something to the calendar.</p>
          )}
          {o.morePriorities ? <p className="mt-2 text-sm text-muted">+{o.morePriorities} more in your calendar</p> : null}
          {o.commitmentsToday.length ? <p className="mt-3 text-xs text-muted">Also today: {o.commitmentsToday.map((c) => `${c.title} ${time(c.start)}`).join(" · ")}</p> : null}
        </Card>

        <div className="flex flex-col gap-4">
          {o.revisions.length || o.cardsDue ? (
            <Card className="p-5">
              <SectionTitle>{t("dueRevision")}</SectionTitle>
              <ul className="flex flex-col gap-1.5 text-sm">
                {o.revisions.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <Link href={`/learn/${r.topic.syllabus.subjectId}/topics/${r.topic.id}?tab=revise`} className="text-primary hover:underline">
                      {r.topic.title}
                    </Link>
                    <span className="text-muted"> · {time(r.dueAt)}</span>
                  </li>
                ))}
                {o.cardsDue ? (
                  <li>
                    <Link href="/learn/review" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Layers className="size-4" aria-hidden /> {o.cardsDue} flashcard{o.cardsDue === 1 ? "" : "s"} to review
                    </Link>
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}
          <Card className="p-5">
            <SectionTitle>This week</SectionTitle>
            <p className="text-sm">
              <strong>{formatDuration(o.load.doneMinutes)}</strong> studied{o.load.plannedMinutes ? ` of ${formatDuration(o.load.plannedMinutes)} planned` : ""}
            </p>
            {o.load.plannedMinutes ? <Progress value={Math.min(100, loadPct)} className="mt-2" label="Planned study done this week" /> : null}
            {o.load.missed ? <p className="mt-2 text-xs text-muted">{o.load.missed} session{o.load.missed === 1 ? "" : "s"} slipped — that’s normal; the plan adapts.</p> : null}
          </Card>
          {priority ? (
            <Card className="p-5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Star className="size-3.5" aria-hidden /> Current priority
              </p>
              <p className="font-semibold">{priority.title}</p>
              <Link href="/goals" className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
                View goals <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      {!checkedIn ? (
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle action={<Link href="/journal" className="text-sm font-medium text-primary hover:underline">Journal</Link>}>{t("checkIn")}</SectionTitle>
          <CheckInCard masterOn={privacy.aiUseJournal} />
        </Card>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Checked in today · <MoodDot mood={checkedIn.mood} />
          {profile.quietMode ? null : <span>(+5 XP)</span>}
          <Link href="/journal" className="font-medium text-primary hover:underline">
            Add a reflection
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle>Quick focus</SectionTitle>
          <p className="text-sm text-muted">No plan needed — start a timer and log what you did.</p>
          <div className="flex flex-wrap gap-2">
            {[25, 45].map((m) => (
              <form key={m} action={startFocusAction.bind(null, { minutes: m, title: "Focus session" })}>
                <SubmitButton size="sm" variant="soft">
                  <Timer /> {m} minutes
                </SubmitButton>
              </form>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <details>
            <summary className="cursor-pointer font-semibold">Log study you did without a plan</summary>
            <div className="mt-3">
              <LogStudyForm todayKey={o.todayKey} nowTime={localTimeKey(at, tz)} topics={topics.map((x) => ({ id: x.id, label: `${x.syllabus.subject.name} — ${x.title}` }))} />
            </div>
          </details>
        </Card>
      </div>

      {completeness.percent < 100 ? (
        <Card className="p-5">
          <p className="font-medium">Your profile is {completeness.percent}% complete</p>
          <Progress value={completeness.percent} className="mt-2" label="Profile completeness" />
          <p className="mt-2 text-sm text-muted">Adding {completeness.missing.slice(0, 2).join(" and ")} makes suggestions more relevant.</p>
          <Link href="/onboarding" className={buttonVariants({ size: "sm", variant: "soft", className: "mt-3" })}>
            Continue setup
          </Link>
        </Card>
      ) : null}
      {o.nextSteps.length > 1 ? (
        <p className="text-xs text-muted">
          Next on other roadmaps:{" "}
          {o.nextSteps.slice(1).map((s, i) => (
            <span key={s.topic.id}>
              <Link href={`/learn/${s.subject.id}/topics/${s.topic.id}`} className="text-primary hover:underline">
                {s.subject.name}: {s.topic.title}
              </Link>
              {i < o.nextSteps.length - 2 ? " · " : ""}
            </span>
          ))}
          <Badge className="ml-2">{o.nextSteps.length} subjects</Badge>
        </p>
      ) : null}
    </div>
  );
}
