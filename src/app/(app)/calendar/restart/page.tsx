import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Feather, GraduationCap, Sunrise } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { getBacklog } from "@/server/services/restart";
import { formatInTz } from "@/lib/time";
import { applyRestartAction } from "../actions";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionTitle } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Fresh start" };

export default async function RestartPage() {
  const user = await requireUser();
  const [at, profile] = await Promise.all([now(user.id), getProfile(user.id)]);
  const backlog = await getBacklog(user.id, at);
  const tz = profile.timezone;
  const nothing = !backlog.missedSessions && !backlog.overdueRevisions.length && !backlog.overdueDeadlines.length;

  const options = [
    {
      mode: "FRESH_START" as const,
      icon: Sunrise,
      title: "Fresh start",
      detail: "Clear the backlog, spread overdue revisions out (two a day), and plan a lighter first three days at 60% of your usual time.",
    },
    {
      mode: "CATCH_UP" as const,
      icon: Feather,
      title: "Catch up gradually",
      detail: "Keep everything, spread it over two weeks and reschedule revisions one a day.",
    },
    ...(backlog.examsSoon.length
      ? [
          {
            mode: "EXAM_FIRST" as const,
            icon: GraduationCap,
            title: "Exams first",
            detail: `Focus only on ${backlog.examsSoon.map((s) => s.name).join(", ")} (exam within 30 days). Other subjects wait.`,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/calendar" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Calendar
          </Link>
        }
        title={backlog.daysAway >= 3 ? "Welcome back" : "Let’s reset your plan"}
        description="Falling behind happens to everyone. What matters is the next small step — not the pile behind you."
      />
      <Card className="p-4 sm:p-5">
        <SectionTitle>Where things stand</SectionTitle>
        {nothing ? (
          <p className="text-sm text-muted">Nothing is overdue. You can still re-plan the coming days.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {backlog.daysAway >= 3 ? <li>Last activity {backlog.daysAway} days ago.</li> : null}
            {backlog.missedSessions ? (
              <li>
                {backlog.missedSessions} planned session{backlog.missedSessions === 1 ? "" : "s"} didn’t happen in the last two weeks.
              </li>
            ) : null}
            {backlog.overdueRevisions.length ? (
              <li>
                {backlog.overdueRevisions.length} revision{backlog.overdueRevisions.length === 1 ? "" : "s"} overdue: {[...new Set(backlog.overdueRevisions.map((r) => r.topic.title))].slice(0, 5).join(", ")}
                {backlog.overdueRevisions.length > 5 ? "…" : ""}
              </li>
            ) : null}
            {backlog.overdueDeadlines.length ? (
              <li>
                Deadlines that passed: {backlog.overdueDeadlines.map((d) => `${d.title} (${formatInTz(d.startAt, tz, { day: "numeric", month: "short" })})`).join(", ")} —{" "}
                <Link href="/calendar" className="text-primary underline">
                  mark them done or move them
                </Link>
                .
              </li>
            ) : null}
          </ul>
        )}
      </Card>
      <div className="grid gap-3">
        {options.map((o) => (
          <Card key={o.mode} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <o.icon className="size-8 shrink-0 text-primary" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold">{o.title}</p>
              <p className="text-sm text-muted">{o.detail}</p>
            </div>
            <form action={applyRestartAction.bind(null, o.mode)}>
              <SubmitButton variant={o.mode === "FRESH_START" ? "primary" : "outline"}>Choose</SubmitButton>
            </form>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted">Each option replaces only sessions NextChapter planned for the future. Your classes, events and finished work stay as they are.</p>
    </div>
  );
}
