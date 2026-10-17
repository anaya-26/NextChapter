import type { Metadata } from "next";
import type { PostKind } from "@/generated/prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { communityAccess, getGroup, listPosts } from "@/server/services/community";
import { listRooms } from "@/server/services/focus-rooms";
import { localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CreateRoomButton, GroupMembershipButton, PostComposer } from "@/components/community/community-ui";
import { KIND_LABEL, POST_KINDS, PostList } from "@/components/community/post-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage(props: PageProps<"/community/groups/[slug]">) {
  const user = await requireUser();
  const at = await now(user.id);
  const { slug } = await props.params;
  const { kind } = await props.searchParams;
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const group = await getGroup(user.id, slug, at);
  if (!group) notFound();
  const k = typeof kind === "string" && kind in KIND_LABEL ? (kind as keyof typeof KIND_LABEL) : undefined;
  const [posts, rooms, profile] = await Promise.all([listPosts(user.id, at, { groupId: group.id, kind: k as PostKind | undefined }), listRooms(user.id, at, group.id), getProfile(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Link href="/community/groups">Groups</Link>}
        title={group.name}
        description={group.description}
        actions={
          <>
            <Badge tone="outline">{group.audience === "ALL_AGES" ? "All ages · strictly moderated" : group.audience === "TEENS" ? "Ages 13–17" : "18+"}</Badge>
            <GroupMembershipButton groupId={group.id} member={!!group.myRole} />
          </>
        }
      />
      {group.rules ? <p className="-mt-3 text-sm text-muted">{group.rules}</p> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section className="flex flex-col gap-3">
          <nav aria-label="Post types" className="flex flex-wrap gap-1.5 text-sm">
            <Link href={`/community/groups/${slug}`} className={cn("rounded-full px-3 py-1", !k ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
              All
            </Link>
            {POST_KINDS.map((p) => (
              <Link key={p.value} href={`/community/groups/${slug}?kind=${p.value}`} className={cn("rounded-full px-3 py-1", k === p.value ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
                {KIND_LABEL[p.value]}s
              </Link>
            ))}
          </nav>
          {posts.length ? <PostList posts={posts} tz={profile.timezone} showGroup={false} /> : <EmptyState title="No posts here yet" description="Ask a question or explain something you’ve understood well." />}
        </section>
        <aside className="flex flex-col gap-4">
          {access.canPost ? (
            <Card className="p-4">
              <SectionTitle>Post here</SectionTitle>
              <PostComposer groups={[{ id: group.id, name: group.name }]} defaultGroupId={group.id} handle={access.member.handle} />
            </Card>
          ) : null}
          <Card className="p-4">
            <SectionTitle action={access.canPost ? <CreateRoomButton groups={[{ id: group.id, name: group.name }]} defaultGroupId={group.id} todayKey={localDateKey(at, profile.timezone)} /> : null}>Focus rooms</SectionTitle>
            {rooms.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <Link href={`/community/rooms/${r.id}`} className="hover:text-primary hover:underline">
                      {r.title}
                    </Link>{" "}
                    <span className="text-muted">{r.phase === "LIVE" ? `· live, ${r.hereNow} here` : `· ${r.startsAt.toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: profile.timezone })}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No rooms scheduled.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
