import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { communityAccess, listGroups } from "@/server/services/community";
import { CreateGroupButton, GroupMembershipButton } from "@/components/community/community-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Groups" };

const AUDIENCE: Record<string, string> = { ALL_AGES: "All ages · strictly moderated", TEENS: "Ages 13–17", ADULTS: "18+" };

export default async function GroupsPage() {
  const user = await requireUser();
  const at = await now(user.id);
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const groups = await listGroups(user.id, at);
  const canCreate = access.canPost && (access.ageBand === "ADULT" || access.ageBand === "TEEN_13_15" || access.ageBand === "TEEN_16_17");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Groups"
        description="You see the groups meant for your age band. Official groups are run and moderated by Kadam."
        actions={canCreate ? <CreateGroupButton audienceNote={access.ageBand === "ADULT" ? "Groups you start are for students aged 18+." : "Groups you start are for students aged 13–17."} /> : null}
      />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <li key={g.id}>
            <Card className="flex h-full flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {g.isOfficial ? <Badge tone="primary">Official</Badge> : <Badge tone="outline">Student-run</Badge>}
                <Badge tone="outline">{AUDIENCE[g.audience]}</Badge>
              </div>
              <Link href={`/community/groups/${g.slug}`} className="font-semibold hover:text-primary hover:underline">
                {g.name}
              </Link>
              <p className="text-sm text-muted">{g.description}</p>
              <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted">
                <span>
                  {g._count.members} member{g._count.members === 1 ? "" : "s"} · {g._count.posts} post{g._count.posts === 1 ? "" : "s"}
                </span>
                <GroupMembershipButton groupId={g.id} member={!!g.myRole} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
