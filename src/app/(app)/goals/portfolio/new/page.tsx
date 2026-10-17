import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { ACHIEVEMENT_KINDS, achievementSuggestions, skillsOverview } from "@/server/services/portfolio";
import { AchievementForm, emptyAchievement } from "@/components/portfolio/portfolio-ui";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Add achievement" };

export default async function NewAchievementPage(props: PageProps<"/goals/portfolio/new">) {
  const user = await requireUser();
  const { from } = await props.searchParams;
  const [suggestions, skills] = await Promise.all([achievementSuggestions(user.id), skillsOverview(user.id)]);
  const prefill = typeof from === "string" ? suggestions.find((s) => s.key === from)?.prefill : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/goals/portfolio" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Portfolio
      </Link>
      <PageHeader title="Add an achievement" description="It’s saved as a draft. Approve it when it’s accurate — only approved entries appear in CVs." />
      <Card className="p-5">
        <AchievementForm id={null} kinds={ACHIEVEMENT_KINDS} skillSuggestions={skills.demonstrated.map((d) => d.skill)} values={prefill ? { ...emptyAchievement, ...prefill } : emptyAchievement} />
      </Card>
    </div>
  );
}
