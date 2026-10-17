import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile, profileCompleteness } from "@/server/services/profile";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Progress } from "@/components/ui/feedback";
import { zonedParts } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage(props: PageProps<"/today">) {
  const user = await requireUser();
  const { welcome } = await props.searchParams;
  const t = await getTranslations("today");
  const [profile, at] = await Promise.all([getProfile(user.id), now(user.id)]);
  const hour = zonedParts(at, profile.timezone).hour;
  const name = profile.displayName ?? user.name.split(" ")[0];
  const greeting = hour < 12 ? t("greetingMorning", { name }) : hour < 17 ? t("greetingAfternoon", { name }) : t("greetingEvening", { name });
  const completeness = profileCompleteness(profile);
  const priority = await prisma.goal.findFirst({ where: { userId: user.id, isCurrentPriority: true, status: "ACTIVE" } });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={greeting} />
      {welcome ? (
        <Card className="flex items-start gap-3 border-primary/40 bg-primary-soft/50 p-5">
          <Sparkles className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">You&apos;re set up!</p>
            <p className="text-sm text-muted">Next: add a syllabus in Learn so Kadam can build your roadmap.</p>
          </div>
        </Card>
      ) : null}
      {priority ? (
        <Card className="p-5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Star className="size-3.5" aria-hidden /> Current priority
          </p>
          <p className="text-lg font-semibold">{priority.title}</p>
          <Link href="/goals" className="mt-2 inline-flex items-center gap-1 text-sm text-primary">
            View goals <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      ) : null}
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
    </div>
  );
}
