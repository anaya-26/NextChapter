import type { Metadata } from "next";
import { Target } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { listGoals } from "@/server/services/goals";
import { GoalCard, GoalForm } from "@/components/goals/goal-ui";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const user = await requireUser();
  const [goals, profile, at] = await Promise.all([listGoals(user.id), getProfile(user.id), now(user.id)]);
  const active = goals.filter((g) => g.status === "ACTIVE" || g.status === "PAUSED");
  const done = goals.filter((g) => g.status === "ACHIEVED" || g.status === "DROPPED");
  const priority = active.find((g) => g.isCurrentPriority);
  const view = (g: (typeof goals)[number]) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    whyItMatters: g.whyItMatters,
    horizon: g.horizon,
    category: g.category,
    status: g.status,
    targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
    isCurrentPriority: g.isCurrentPriority,
    origin: g.origin,
    isDemo: g.isDemo,
    milestones: g.milestones.map((m) => ({ id: m.id, title: m.title, dueAt: m.dueAt?.toISOString().slice(0, 10) ?? null, done: !!m.completedAt })),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="Short-term goals keep this month focused; long-term goals give it direction. One goal can be your current priority."
      />

      {priority ? (
        <section aria-labelledby="priority-heading">
          <h2 id="priority-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Current priority
          </h2>
          <GoalCard goal={view(priority)} today={at.toISOString()} timezone={profile.timezone} highlight />
        </section>
      ) : null}

      <Card className="p-0">
        <details open={goals.length === 0} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold">
            Add a goal
            <span className="text-sm font-normal text-primary group-open:hidden">Open form</span>
          </summary>
          <div className="px-5 pb-5">
            <GoalForm />
          </div>
        </details>
      </Card>

      {active.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Start with something small and specific, like “Finish Unit 2 of Chemistry by 30 Nov”." />
      ) : (
        <>
          {(["SHORT", "LONG"] as const).map((h) => {
            const list = active.filter((g) => g.horizon === h && !g.isCurrentPriority);
            if (!list.length) return null;
            return (
              <section key={h}>
                <SectionTitle>{h === "SHORT" ? "Short-term goals" : "Long-term goals"}</SectionTitle>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {list.map((g) => (
                    <GoalCard key={g.id} goal={view(g)} today={at.toISOString()} timezone={profile.timezone} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {done.length ? (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Achieved and set aside ({done.length})</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {done.map((g) => (
              <GoalCard key={g.id} goal={view(g)} today={at.toISOString()} timezone={profile.timezone} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
