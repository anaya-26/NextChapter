import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon, Lock, Mic, NotebookPen, Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getPrivacy, getProfile } from "@/server/services/profile";
import { daySummary, listEntries } from "@/server/services/journal";
import { openSuggestions } from "@/server/services/suggestions";
import { formatInTz, localDateKey } from "@/lib/time";
import { needsWellbeingSupport } from "@/lib/wellbeing";
import { truncate } from "@/lib/utils";
import { CheckInCard, EntryForm, MoodDot, SuggestionList } from "@/components/journal/journal-ui";
import { SupportNotice } from "@/components/journal/support-notice";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DemoBadge, EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { toSuggestionViews } from "./view";

export const metadata: Metadata = { title: "My Journal" };

const KIND_LABEL: Record<string, string> = { CHECK_IN: "Check-in", REFLECTION: "Reflection", NOTE: "Note", VOICE: "Voice note" };

export default async function JournalPage(props: PageProps<"/journal">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [profile, privacy, at] = await Promise.all([getProfile(user.id), getPrivacy(user.id), now(user.id)]);
  const tz = profile.timezone;
  const todayKey = localDateKey(at, tz);
  const [entries, prefill, suggestions, topics] = await Promise.all([
    listEntries(user.id, { take: 40 }),
    daySummary(user.id, todayKey, at),
    openSuggestions(user.id, { origin: "JOURNAL" }),
    prisma.topic.findMany({
      where: { userId: user.id, syllabus: { status: "CONFIRMED", subject: { status: "ACTIVE" } }, status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: { title: true },
      take: 8,
    }),
  ]);
  const checkedInToday = entries.some((e) => e.kind === "CHECK_IN" && e.date.toISOString().slice(0, 10) === todayKey);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="My Journal"
        description="Private reflections, notes, voice notes and photos — and an honest record of planned vs actual study."
      />
      <Notice tone="neutral" title="Private to you">
        <span className="inline-flex flex-wrap items-center gap-1">
          <Lock className="size-3.5" aria-hidden /> Never shared to Community. The AI reads an entry only if you allow that entry{" "}
          {privacy.aiUseJournal ? "(journal access is on)" : "and turn on journal access in"}{" "}
          {privacy.aiUseJournal ? null : (
            <Link href="/settings/privacy" className="font-medium underline">
              Privacy settings
            </Link>
          )}
          .
        </span>
      </Notice>
      {sp.support ? <SupportNotice /> : null}
      {sp.deleted ? <Notice tone="success">Entry deleted, along with anything learned from it.</Notice> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle>Quick check-in</SectionTitle>
          {checkedInToday ? <p className="text-sm text-muted">You’ve checked in today. You can add another if your day changed.</p> : null}
          <CheckInCard masterOn={privacy.aiUseJournal} />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle>Write an entry</SectionTitle>
          <EntryForm todayKey={todayKey} prefill={prefill} masterOn={privacy.aiUseJournal} topicSuggestions={topics.map((t) => t.title)} />
        </Card>
      </div>

      {suggestions.length ? (
        <Card className="p-5">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" aria-hidden /> Suggested from your journal
            </span>
          </SectionTitle>
          <SuggestionList items={toSuggestionViews(suggestions)} />
        </Card>
      ) : null}

      <section aria-labelledby="entries-heading">
        <h2 id="entries-heading" className="mb-2 font-semibold">
          Entries
        </h2>
        {entries.length ? (
          <Card className="divide-y divide-border">
            {entries.map((e) => {
              const flagged = needsWellbeingSupport(e.text, e.difficulties);
              return (
                <Link key={e.id} href={`/journal/${e.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2/60">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{formatInTz(new Date(`${e.date.toISOString().slice(0, 10)}T12:00:00Z`), "UTC", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <Badge>{KIND_LABEL[e.kind]}</Badge>
                    <MoodDot mood={e.mood} />
                    {e.photoFileKeys.length ? <ImageIcon className="size-4 text-muted" aria-label={`${e.photoFileKeys.length} photos`} /> : null}
                    {e.voiceFileKey ? <Mic className="size-4 text-muted" aria-label="Voice note" /> : null}
                    {e.aiAccess && privacy.aiUseJournal ? <Badge tone="info">AI may read</Badge> : null}
                    {e.isDemo ? <DemoBadge /> : null}
                  </div>
                  {e.title ? <p className="font-medium">{e.title}</p> : null}
                  <p className="text-sm text-muted">{flagged ? "Support resources are shown with this entry." : truncate(e.text ?? e.achievements ?? e.difficulties ?? (e.voiceFileKey ? "Voice note" : ""), 180)}</p>
                </Link>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={NotebookPen} title="Your journal is empty" description="A one-tap check-in is a good start. Reflections help you notice what works for you." />
        )}
      </section>
    </div>
  );
}
