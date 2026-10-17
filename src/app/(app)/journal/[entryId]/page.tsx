import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { getPrivacy } from "@/server/services/profile";
import { getEntry } from "@/server/services/journal";
import { openSuggestions } from "@/server/services/suggestions";
import { formatInTz } from "@/lib/time";
import { needsWellbeingSupport } from "@/lib/wellbeing";
import { EntryActions, MoodDot, SuggestionList } from "@/components/journal/journal-ui";
import { SupportNotice } from "@/components/journal/support-notice";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DemoBadge, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { fileIds, toSuggestionViews } from "../view";

export const metadata: Metadata = { title: "Journal entry" };

export default async function EntryPage(props: PageProps<"/journal/[entryId]">) {
  const user = await requireUser();
  const { entryId } = await props.params;
  const [entry, privacy] = await Promise.all([getEntry(user.id, entryId), getPrivacy(user.id)]);
  if (!entry) notFound();
  const [photos, voice, suggestions] = await Promise.all([
    fileIds(user.id, entry.photoFileKeys),
    fileIds(user.id, entry.voiceFileKey ? [entry.voiceFileKey] : []),
    openSuggestions(user.id, { origin: "JOURNAL", sourceId: entry.id }),
  ]);
  const flagged = needsWellbeingSupport(entry.text, entry.difficulties, entry.voiceTranscript);
  const dateLabel = formatInTz(new Date(`${entry.date.toISOString().slice(0, 10)}T12:00:00Z`), "UTC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/journal" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Journal
          </Link>
        }
        title={entry.title ?? dateLabel}
        description={entry.title ? dateLabel : undefined}
        actions={entry.isDemo ? <DemoBadge /> : null}
      />
      {flagged ? <SupportNotice /> : null}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MoodDot mood={entry.mood} />
          {entry.energy ? <Badge>Energy {entry.energy}/5</Badge> : null}
          {entry.topicsStudied.map((t) => (
            <Badge key={t} tone="primary">
              {t}
            </Badge>
          ))}
        </div>
        {entry.plannedSummary || entry.actualSummary ? (
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            {entry.plannedSummary ? <p>Planned: {entry.plannedSummary}</p> : null}
            {entry.actualSummary ? <p>Actual: {entry.actualSummary}</p> : null}
          </div>
        ) : null}
        {entry.text ? <p className="whitespace-pre-line">{entry.text}</p> : null}
        {entry.achievements ? (
          <p className="text-sm">
            <span className="font-medium">Went well: </span>
            {entry.achievements}
          </p>
        ) : null}
        {entry.difficulties ? (
          <p className="text-sm">
            <span className="font-medium">Difficult: </span>
            {entry.difficulties}
          </p>
        ) : null}
        {voice[0] ? (
          <div className="flex flex-col gap-1">
            <audio controls src={`/api/files/${voice[0].id}`} className="w-full max-w-md" />
            <p className="text-xs text-muted">{entry.voiceTranscript ? `Transcript: ${entry.voiceTranscript}` : "No transcript — automatic transcription isn’t configured on this server."}</p>
          </div>
        ) : null}
        {photos.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <a key={p.id} href={`/api/files/${p.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-only file */}
                <img src={`/api/files/${p.id}`} alt="Photo attached to this entry" className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </Card>
      <Card className="p-5">
        <EntryActions
          id={entry.id}
          allowed={entry.aiAccess}
          masterOn={privacy.aiUseJournal}
          edit={{ title: entry.title ?? "", text: entry.text ?? "", achievements: entry.achievements ?? "", difficulties: entry.difficulties ?? "", topics: entry.topicsStudied }}
        />
      </Card>
      {entry.memories.length ? (
        <Card className="p-5">
          <SectionTitle action={<Link href="/settings/memory" className="text-sm font-medium text-primary hover:underline">Manage memory</Link>}>What Kadam noted from this entry</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm">
            {entry.memories.map((m) => (
              <li key={m.id} className="rounded-lg bg-surface-2 px-3 py-2">
                {m.content} <Badge className="ml-1">{m.certainty === "TENTATIVE" ? "Tentative" : "Confirmed"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {suggestions.length ? (
        <Card className="p-5">
          <SectionTitle>Suggested next steps</SectionTitle>
          <SuggestionList items={toSuggestionViews(suggestions)} />
        </Card>
      ) : null}
    </div>
  );
}
