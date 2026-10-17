import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { getConversation, listConversations } from "@/server/services/companion";
import { Chat, CoachingSettings, DeleteConversation, type ChatMessage } from "@/components/companion/chat";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { ConversationList } from "../conversation-list";

export const metadata: Metadata = { title: "Companion" };

export default async function ConversationPage(props: PageProps<"/companion/[conversationId]">) {
  const user = await requireUser();
  const { conversationId } = await props.params;
  const { send } = await props.searchParams;
  const [conversation, conversations, profile] = await Promise.all([getConversation(user.id, conversationId), listConversations(user.id), getProfile(user.id)]);
  if (!conversation) notFound();
  const actions = await prisma.suggestedAction.findMany({
    where: { userId: user.id, origin: "COMPANION", status: "PROPOSED", sourceId: { in: conversation.messages.map((m) => m.id) } },
    select: { id: true, title: true, sourceId: true },
  });
  const initial: ChatMessage[] = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    used: m.contextUsed,
    generatedBy: m.generatedBy,
    actions: actions.filter((a) => a.sourceId === m.id).map((a) => ({ id: a.id, label: a.title })),
  }));
  const t = conversation.topic?.title;
  const starters = t
    ? [`Explain ${t} simply`, `Quiz me on ${t}`, `What do exams usually ask about ${t}?`]
    : conversation.context === "CAREER"
      ? ["What could I explore based on what I enjoy?", "What should I try this month to learn more?"]
      : ["What should I study right now?", "Make me a plan for this week", "I’m behind — help me catch up"];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block">
        <Link href="/companion" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> All conversations
        </Link>
        <ConversationList items={conversations} activeId={conversation.id} />
      </aside>
      <div className="min-w-0">
        <PageHeader
          eyebrow={
            <Link href="/companion" className="inline-flex items-center gap-1 hover:text-fg lg:hidden">
              <ArrowLeft className="size-3.5" aria-hidden /> Conversations
            </Link>
          }
          title={conversation.title}
          description={conversation.topic ? `About ${conversation.topic.title} — answers can use your materials for this topic.` : undefined}
          actions={
            <>
              <CoachingSettings tone={profile.companionTone} intensity={profile.coachingIntensity} reminders={profile.reminderFrequency} />
              <DeleteConversation id={conversation.id} />
            </>
          }
        />
        <Card className="p-4 sm:p-5">
          <Chat conversationId={conversation.id} initial={initial} starters={starters} voiceLang={profile.explanationLanguage} autoSend={typeof send === "string" ? send : null} />
        </Card>
      </div>
    </div>
  );
}
