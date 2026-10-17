import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarDays, Compass, LifeBuoy, NotebookPen, Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { aiStatus } from "@/server/ai";
import { getProfile } from "@/server/services/profile";
import { listConversations } from "@/server/services/companion";
import { newConversationAction } from "./actions";
import { ConversationList } from "./conversation-list";
import { CoachingSettings } from "@/components/companion/chat";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Companion" };

const STARTS = [
  { context: "GENERAL" as const, icon: Sparkles, title: "What should I do now?", message: "What should I study right now?" },
  { context: "PLANNING" as const, icon: CalendarDays, title: "Plan my week", message: "Help me plan my study this week." },
  { context: "RESTART" as const, icon: LifeBuoy, title: "I’m behind", message: "I've fallen behind — help me catch up without panicking." },
  { context: "REFLECTION" as const, icon: NotebookPen, title: "Think out loud", message: "Can we talk about how my studies are going?" },
  { context: "CAREER" as const, icon: Compass, title: "Careers", message: "What could I explore based on what I enjoy?" },
];

export default async function CompanionPage(props: PageProps<"/companion">) {
  const user = await requireUser();
  const { from } = await props.searchParams;
  const [conversations, profile] = await Promise.all([listConversations(user.id), getProfile(user.id)]);
  const ai = aiStatus();
  const topicId = typeof from === "string" ? /^\/learn\/[^/]+\/topics\/([^/?#]+)/.exec(from)?.[1] : undefined;
  const topic = topicId ? await prisma.topic.findFirst({ where: { id: topicId, userId: user.id }, select: { id: true, title: true } }) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Companion"
        description="Ask for an explanation, a plan, a quiz, or just a nudge to start. NextChapter uses only what you allow in Privacy settings and shows what it used."
        actions={<CoachingSettings tone={profile.companionTone} intensity={profile.coachingIntensity} reminders={profile.reminderFrequency} />}
      />
      {!ai.configured ? (
        <Notice tone="neutral" title="AI isn’t set up on this server">
          The companion can still open the planner, start a focus session or your reviews. <Link href="/settings/integrations" className="font-medium underline">What’s needed</Link>
        </Notice>
      ) : null}
      {topic ? (
        <Card className="flex flex-col gap-3 border-primary/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="size-6 text-primary" aria-hidden />
            <div>
              <p className="text-sm text-muted">From the topic you were on</p>
              <p className="font-semibold">{topic.title}</p>
            </div>
          </div>
          <form action={newConversationAction.bind(null, { context: "TOPIC", topicId: topic.id })}>
            <SubmitButton>Ask about this topic</SubmitButton>
          </form>
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STARTS.map((s) => (
          <form key={s.context} action={newConversationAction.bind(null, { context: s.context, message: s.message })}>
            <button type="submit" className="flex h-full w-full flex-col items-start gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left shadow-card hover:border-primary">
              <s.icon className="size-5 text-primary" aria-hidden />
              <span className="font-medium">{s.title}</span>
              <span className="text-xs text-muted">“{s.message}”</span>
            </button>
          </form>
        ))}
      </div>
      <Card className="p-5">
        <SectionTitle
          action={
            <form action={newConversationAction.bind(null, { context: "GENERAL" })}>
              <SubmitButton size="sm" variant="outline">
                New conversation
              </SubmitButton>
            </form>
          }
        >
          Your conversations
        </SectionTitle>
        <ConversationList items={conversations} />
      </Card>
    </div>
  );
}
