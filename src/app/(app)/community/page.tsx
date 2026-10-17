import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, ShieldCheck, Timer, Users } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { communityAccess, listGroups, listPosts } from "@/server/services/community";
import { listRooms } from "@/server/services/focus-rooms";
import { COMMUNITY_GUIDELINES, HANDLE_RULES } from "@/lib/community-safety";
import { JoinForm } from "@/components/community/community-ui";
import { PostList } from "@/components/community/post-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage(props: PageProps<"/community">) {
  const user = await requireUser();
  const at = await now(user.id);
  const { welcome } = await props.searchParams;
  const [access, profile] = await Promise.all([communityAccess(user.id, at), getProfile(user.id)]);

  if (access.needsConsent) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Community" description="Study groups, focus rooms and peer explanations." />
        <Notice tone="info" title="Ask a parent or guardian first">
          Because you’re under 18, the community opens once a parent or guardian’s consent is recorded in <Link href="/settings/privacy">Settings → Privacy</Link>. Everything else in Kadam works without it.
        </Notice>
      </div>
    );
  }

  if (!access.member) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Community" description="Optional. Ask questions, explain things to each other, share resources and study together in focus rooms." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <Card className="p-5">
            <h2 className="mb-1 text-lg font-semibold">Join with a handle</h2>
            <p className="mb-4 text-sm text-muted">Others see only your handle — never your name, email, school, journal or progress. Nothing private is shared unless you post it yourself.</p>
            <JoinForm guidelines={COMMUNITY_GUIDELINES} rules={HANDLE_RULES} />
          </Card>
          <Card className="flex flex-col gap-3 p-5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> How it’s kept safe
            </p>
            <ul className="list-disc pl-5 text-muted">
              <li>Spaces by age: all-ages (strictly moderated), 13–17 and 18+.</li>
              <li>No phone numbers, emails or social handles in posts.</li>
              <li>Report anything; repeated reports hide it until a moderator decides.</li>
              <li>Block anyone — you won’t see each other.</li>
              <li>Leave any time and your posts are deleted.</li>
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  const [posts, groups, rooms] = await Promise.all([listPosts(user.id, at, { take: 20 }), listGroups(user.id, at), listRooms(user.id, at)]);
  const mine = groups.filter((g) => g.myRole);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community"
        description={`You’re ${access.member.handle}. Only your handle is ever shown.`}
        actions={
          <Button asChild>
            <Link href="/community/new">New post</Link>
          </Button>
        }
      />
      {welcome ? <Notice tone="success" title="Welcome!">Join a few groups below to fill your feed. Your posts appear only in the groups you choose.</Notice> : null}
      {access.suspendedUntil ? <Notice tone="warning">Posting is paused until {access.suspendedUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: profile.timezone })} after a moderation decision. You can still read.</Notice> : null}
      {access.isModerator ? (
        <Notice tone="info" action={<Button asChild size="sm" variant="outline"><Link href="/community/moderation">Open the moderation queue</Link></Button>}>
          You’re a moderator.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section>
          <SectionTitle>From your groups</SectionTitle>
          {posts.length ? <PostList posts={posts} tz={profile.timezone} /> : <EmptyState icon={MessagesSquare} title={mine.length ? "Quiet so far" : "Join a group to see posts"} description={mine.length ? "Ask the first question or share something useful." : "Pick a group for your class, exam or interest."} action={<Button asChild variant="outline"><Link href={mine.length ? "/community/new" : "/community/groups"}>{mine.length ? "Write a post" : "Browse groups"}</Link></Button>} />}
        </section>
        <aside className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Users className="size-4" aria-hidden /> Your groups
            </h2>
            {mine.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {mine.map((g) => (
                  <li key={g.id}>
                    <Link href={`/community/groups/${g.slug}`} className="hover:text-primary hover:underline">
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None yet.</p>
            )}
            <Link href="/community/groups" className="mt-2 inline-block text-sm text-primary hover:underline">
              Browse all groups
            </Link>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Timer className="size-4" aria-hidden /> Focus rooms
            </h2>
            {rooms.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {rooms.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Link href={`/community/rooms/${r.id}`} className="flex-1 hover:text-primary hover:underline">
                      {r.title}
                    </Link>
                    {r.phase === "LIVE" ? <Badge tone="success">Live · {r.hereNow} here</Badge> : <Badge tone="outline">{r.startsAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: profile.timezone })}</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No rooms right now.</p>
            )}
            <Link href="/community/rooms" className="mt-2 inline-block text-sm text-primary hover:underline">
              All rooms
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
