import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getPrivacy } from "@/server/services/profile";
import { communityAccess } from "@/server/services/community";
import { buddySuggestions, listBuddies } from "@/server/services/buddies";
import { BuddyRequestButton, BuddyResponseButtons, DiscoverableSwitch, EndBuddyButton } from "@/components/community/community-ui";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Study buddies" };

export default async function BuddiesPage() {
  const user = await requireUser();
  const at = await now(user.id);
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const eligible = access.ageBand === "ADULT" || access.ageBand === "TEEN_13_15" || access.ageBand === "TEEN_16_17";
  const [privacy, mine, suggestions] = await Promise.all([getPrivacy(user.id), listBuddies(user.id), buddySuggestions(user.id, at)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Study buddies" description="Pair up with someone in your groups to keep each other going — start focus rooms together and check in on goals. Same age bracket only." />
      {!eligible ? (
        <Notice tone="info">Study buddies are for students aged 13 and over. Set your age band in <Link href="/settings">Settings</Link> if you haven’t.</Notice>
      ) : (
        <Card className="p-4">
          <DiscoverableSwitch on={privacy.communityVisible} disabled={!access.canPost} />
        </Card>
      )}
      {mine.incoming.length ? (
        <section>
          <SectionTitle>Requests for you</SectionTitle>
          <Card className="divide-y divide-border">
            {mine.incoming.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-medium">{r.handle}</p>
                  {r.message ? <p className="text-sm text-muted">“{r.message}”</p> : null}
                </div>
                <BuddyResponseButtons id={r.id} />
              </div>
            ))}
          </Card>
        </section>
      ) : null}
      <section>
        <SectionTitle>Your buddies</SectionTitle>
        {mine.buddies.length || mine.outgoing.length ? (
          <Card className="divide-y divide-border">
            {mine.buddies.map((b) => (
              <div key={b.id} className="flex items-center gap-2 p-4">
                <p className="flex-1 font-medium">{b.handle}</p>
                <EndBuddyButton id={b.id} label="End" />
              </div>
            ))}
            {mine.outgoing.map((b) => (
              <div key={b.id} className="flex items-center gap-2 p-4">
                <p className="flex-1">
                  <span className="font-medium">{b.handle}</span> <span className="text-sm text-muted">· request sent</span>
                </p>
                <EndBuddyButton id={b.id} label="Cancel" />
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted">No buddies yet.</Card>
        )}
      </section>
      {eligible ? (
        <section>
          <SectionTitle>Students in your groups who are open to it</SectionTitle>
          {suggestions.length ? (
            <Card className="divide-y divide-border">
              {suggestions.map((s) => (
                <div key={s.handle} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.handle}</p>
                    <p className="text-sm text-muted">
                      {s.bio ? `${s.bio} · ` : ""}In {s.groups.join(", ")}
                    </p>
                  </div>
                  <BuddyRequestButton handle={s.handle} />
                </div>
              ))}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-muted">Nobody yet. Join more groups — only students who switched on “find me as a study buddy” appear here.</Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
