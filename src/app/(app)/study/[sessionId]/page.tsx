import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { getSession } from "@/server/services/sessions";
import { formatInTz } from "@/lib/time";
import { startSessionAction } from "../../calendar/actions";
import { FinishSessionForm, FocusTimer, MissSessionForm } from "@/components/calendar/planning-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Study session" };

export default async function StudySessionPage(props: PageProps<"/study/[sessionId]">) {
  const user = await requireUser();
  const { sessionId } = await props.params;
  const [session, at, profile] = await Promise.all([getSession(user.id, sessionId), now(user.id), getProfile(user.id)]);
  if (!session) notFound();
  const xp = session.status === "COMPLETED" || session.status === "PARTIAL" ? await prisma.xpEvent.findFirst({ where: { userId: user.id, dedupeKey: `session:${session.id}` } }) : null;
  const tz = profile.timezone;
  const topicHref = session.topic ? `/learn/${session.topic.syllabus.subjectId}/topics/${session.topic.id}` : null;
  const elapsed = session.startedAt ? Math.max(0, Math.round((at.getTime() - session.startedAt.getTime()) / 1000)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/today" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Today
          </Link>
        }
        title={session.title ?? session.topic?.title ?? "Study session"}
        description={
          session.plannedStart
            ? `Planned for ${formatInTz(session.plannedStart, tz, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${session.plannedMinutes ? ` · ${session.plannedMinutes} min` : ""}`
            : session.plannedMinutes
              ? `${session.plannedMinutes} minutes`
              : undefined
        }
      />
      {topicHref ? (
        <Link href={topicHref} className="text-sm font-medium text-primary hover:underline">
          Open the topic: {session.topic!.title}
        </Link>
      ) : null}

      {session.status === "PLANNED" ? (
        <Card className="flex flex-col gap-4 p-5">
          <form action={startSessionAction.bind(null, session.id)}>
            <SubmitButton size="lg">
              <Play /> Start now
            </SubmitButton>
          </form>
          <p className="text-sm text-muted">Tip: phone face down, one tab open, water nearby.</p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Couldn’t do it?</summary>
            <div className="mt-2">
              <MissSessionForm sessionId={session.id} />
            </div>
          </details>
        </Card>
      ) : null}

      {session.status === "IN_PROGRESS" ? (
        <Card className="flex flex-col gap-4 p-5">
          <FocusTimer elapsedAtRender={elapsed} plannedMinutes={session.plannedMinutes} />
          <div className="border-t border-border pt-4">
            <h2 className="mb-3 font-semibold">Finish and log it</h2>
            <FinishSessionForm sessionId={session.id} hasTopic={!!session.topic} defaultMinutes={Math.max(1, Math.round(elapsed / 60))} />
          </div>
        </Card>
      ) : null}

      {session.status === "COMPLETED" || session.status === "PARTIAL" ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" aria-hidden /> {session.actualMinutes} minutes logged{session.status === "PARTIAL" ? " (shorter than planned — that still counts)" : ""}
          </p>
          {xp ? <p className="text-sm font-medium text-primary">+{xp.points} XP for focused study</p> : null}
          {session.achievements ? <p className="text-sm">Went well: {session.achievements}</p> : null}
          {session.difficulties ? <p className="text-sm">Difficult: {session.difficulties}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/today" className={buttonVariants({ size: "sm" })}>
              Back to Today
            </Link>
            {topicHref ? (
              <Link href={`${topicHref}?tab=practice`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Check understanding with practice
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      {session.status === "MISSED" ? (
        <Notice tone="neutral" title="Marked as not done" action={<Link href="/calendar/plan" className="font-medium underline">Re-plan</Link>}>
          {session.missedReason ? `Reason: ${session.missedReason}. ` : ""}It’s fine — plans exist to be adjusted.
        </Notice>
      ) : null}
    </div>
  );
}
