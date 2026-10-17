import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { communityAccess, listBlocked } from "@/server/services/community";
import { COMMUNITY_GUIDELINES, HANDLE_RULES } from "@/lib/community-safety";
import { LeaveCommunityButton, ProfileForm, UnblockButton } from "@/components/community/community-ui";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Community profile" };

export default async function CommunityProfilePage() {
  const user = await requireUser();
  const at = await now(user.id);
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const blocked = await listBlocked(user.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile & safety" description="What others can see, who you’ve blocked, and how to leave." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Your public handle</SectionTitle>
          <ProfileForm handle={access.member.handle} bio={access.member.bio ?? ""} rules={HANDLE_RULES} />
          <p className="mt-3 text-xs text-muted">Others never see your name, email, school, journal, progress, goals or portfolio — only what you post.</p>
        </Card>
        <Card className="p-5">
          <SectionTitle>Blocked</SectionTitle>
          {blocked.length ? (
            <ul className="flex flex-col gap-1">
              {blocked.map((h) => (
                <li key={h} className="flex items-center justify-between text-sm">
                  {h} <UnblockButton handle={h} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">You haven’t blocked anyone. Use “Block” on any post or reply.</p>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle>Guidelines</SectionTitle>
          <ul className="list-disc pl-5 text-sm text-muted">
            {COMMUNITY_GUIDELINES.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <SectionTitle>Leave the community</SectionTitle>
          <p className="mb-3 text-sm text-muted">Deletes your posts, replies, groups, buddies and handle. Your private work in Kadam stays.</p>
          <LeaveCommunityButton />
        </Card>
      </div>
    </div>
  );
}
