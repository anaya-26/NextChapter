import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { getTestClock } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { TestClockForm, DemoDataControls, ModeratorToggle } from "@/components/settings/developer-ui";
import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { formatInTz, localDateKey, localTimeKey } from "@/lib/time";

export const metadata: Metadata = { title: "Testing tools" };

export default async function DeveloperPage() {
  const user = await requireUser();
  const e = env();
  if (!e.testClockEnabled && !e.ENABLE_DEMO_TOOLS) notFound();
  const [clock, profile] = await Promise.all([getTestClock(user.id), getProfile(user.id)]);
  const current = clock?.simulatedNow ?? new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Testing tools"
        description="For development and demonstrations only. These tools are disabled in production builds."
      />
      {e.testClockEnabled ? (
        <Card className="p-5 sm:p-6">
          <SectionTitle>Test clock</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Simulate a different “now” for your account only — useful for testing reminders, revision schedules and the three-month career discovery review.
            Time keeps moving forward from the moment you set it.
          </p>
          {clock ? (
            <Notice tone="info" className="mb-3">
              Simulated time: <strong>{formatInTz(clock.simulatedNow, profile.timezone, { dateStyle: "full", timeStyle: "short" })}</strong> ({profile.timezone})
            </Notice>
          ) : null}
          <TestClockForm defaultValue={`${localDateKey(current, profile.timezone)}T${localTimeKey(current, profile.timezone)}`} active={!!clock} />
        </Card>
      ) : null}
      {e.ENABLE_DEMO_TOOLS ? (
        <Card className="p-5 sm:p-6">
          <SectionTitle>Demonstration history</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Adds about three months of clearly labelled demonstration activity (study sessions, practice, reflections, achievements) so you can try the
            evidence-based career discovery review without waiting. Every demo record shows a “Demo data” badge and can be removed in one click.
          </p>
          <DemoDataControls loaded={!!profile.demoDataLoadedAt} />
        </Card>
      ) : null}
      {e.ENABLE_DEMO_TOOLS ? (
        <Card className="p-5">
          <SectionTitle>Community moderation</SectionTitle>
          <p className="mb-3 text-sm text-muted">Try the moderation queue. In production, moderators are appointed by an administrator (set <code>isModerator</code> on a community profile).</p>
          <ModeratorToggle on={!!(await prisma.communityProfile.findUnique({ where: { userId: profile.userId }, select: { isModerator: true } }))?.isModerator} />
        </Card>
      ) : null}
    </div>
  );
}
