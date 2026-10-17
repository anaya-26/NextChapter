import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { dueCards, isStale, previewIntervals } from "@/server/services/flashcards";
import { formatInTz } from "@/lib/time";
import { LearnTabs } from "@/components/learn/learn-tabs";
import { ReviewSession, type ReviewCardView } from "@/components/learn/library-ui";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Flashcard review" };

function interval(from: Date, to: Date) {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

export default async function ReviewPage(props: PageProps<"/learn/review">) {
  const user = await requireUser();
  const { topic: topicParam } = await props.searchParams;
  const topicId = typeof topicParam === "string" ? topicParam : undefined;
  const [at, profile] = await Promise.all([now(user.id), getProfile(user.id)]);
  const cards = await dueCards(user.id, at, { topicId, limit: 50 });
  const topic = topicId ? await prisma.topic.findFirst({ where: { id: topicId, userId: user.id }, select: { title: true } }) : null;
  const nextDue = cards.length ? null : await prisma.flashcard.findFirst({ where: { userId: user.id, suspended: false, ...(topicId ? { topicId } : {}) }, orderBy: { due: "asc" }, select: { due: true } });

  const views: ReviewCardView[] = cards.map((c) => {
    const p = previewIntervals(c, at);
    return {
      id: c.id,
      front: c.front,
      back: c.back,
      origin: c.origin,
      stale: isStale(c),
      topic: c.topic ? { title: c.topic.title, href: `/learn/${c.topic.syllabus.subjectId}/topics/${c.topic.id}?tab=cards` } : null,
      intervals: { again: interval(at, p.again), hard: interval(at, p.hard), good: interval(at, p.good), easy: interval(at, p.easy) },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Learn" description="Spaced repetition: answer from memory, then rate how it went. The buttons show when you'll see each card again." />
      <LearnTabs />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {topic ? (
          <p className="text-sm">
            Reviewing <strong>{topic.title}</strong> ·{" "}
            <Link href="/learn/review" className="text-primary underline">
              review all subjects
            </Link>
          </p>
        ) : null}
        {views.length ? (
          <ReviewSession key={views.map((v) => v.id).join()} cards={views} />
        ) : (
          <EmptyState
            icon={Layers}
            title="Nothing due right now"
            description={
              nextDue
                ? `Your next card is due ${formatInTz(nextDue.due, profile.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`
                : "Make flashcards from a topic's notes, its Flashcards tab, or your mistake library."
            }
            action={
              <Link href="/learn" className={buttonVariants({ variant: "outline" })}>
                Go to subjects
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
