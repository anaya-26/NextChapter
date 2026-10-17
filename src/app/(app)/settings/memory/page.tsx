import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/session";
import { getPrivacy, getProfile } from "@/server/services/profile";
import { listMemories } from "@/server/services/memory";
import { MemoryList, AddMemoryForm, ForgetEverything } from "@/components/settings/memory-ui";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "What NextChapter remembers" };

export default async function MemoryPage() {
  const user = await requireUser();
  const [items, privacy, profile] = await Promise.all([listMemories(user.id), getPrivacy(user.id), getProfile(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What NextChapter remembers"
        description="Everything the companion uses to personalise help. Confirm what's right, correct what isn't, and delete anything — deletions take effect immediately."
      />

      {!privacy.aiMemoryEnabled ? (
        <Notice tone="info" title="Memory is switched off">
          The companion won’t use or add memories. <Link href="/settings/privacy">Change in Privacy</Link>.
        </Notice>
      ) : null}

      <Card className="p-5 sm:p-6">
        <SectionTitle>Also used: your profile</SectionTitle>
        <p className="text-sm text-muted">
          {[profile.course, profile.yearOrClass, profile.boardOrUniversity].filter(Boolean).join(" · ") || "No education details yet"}
          {profile.examTargets.length ? ` · Exams: ${profile.examTargets.join(", ")}` : ""}
        </p>
        <p className="mt-2 text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings">
            Edit profile
          </Link>{" "}
          ·{" "}
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/privacy">
            Choose what the AI may use
          </Link>
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle>Tell NextChapter something to remember</SectionTitle>
        <AddMemoryForm />
      </Card>

      <section>
        <SectionTitle action={items.length ? <ForgetEverything /> : null}>Remembered ({items.length})</SectionTitle>
        <MemoryList
          items={items.map((m) => ({
            id: m.id,
            kind: m.kind,
            content: m.content,
            source: m.source,
            certainty: m.certainty,
            evidence: m.evidence,
            correctedFrom: m.correctedFrom,
            journalDate: m.journalEntry?.date.toISOString().slice(0, 10) ?? null,
            journalEntryId: m.journalEntry?.id ?? null,
          }))}
        />
      </section>
    </div>
  );
}
