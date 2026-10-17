import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { communityAccess } from "@/server/services/community";
import { getRoom } from "@/server/services/focus-rooms";
import { JoinRoomForm, LeaveRoomButton, RoomPresence, RoomTimer } from "@/components/community/community-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Focus room" };

export default async function RoomPage(props: PageProps<"/community/rooms/[roomId]">) {
  const user = await requireUser();
  const at = await now(user.id);
  const { roomId } = await props.params;
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const room = await getRoom(user.id, roomId, at);
  if (!room) notFound();
  const inRoom = !!room.me && !room.me.leftAt;
  const session = inRoom ? await prisma.studySession.findFirst({ where: { userId: user.id, focusRoomId: room.id, status: "IN_PROGRESS" }, select: { id: true } }) : null;
  return (
    <div className="flex flex-col gap-6">
      <RoomPresence roomId={room.id} active={inRoom} />
      <PageHeader
        eyebrow={<Link href="/community/rooms">Focus rooms</Link>}
        title={room.title}
        description={`Hosted by ${room.host.communityProfile?.handle ?? "a member"}${room.group ? ` in ${room.group.name}` : ""} · ${room.durationMinutes} minutes`}
        actions={<Badge tone={room.phase === "LIVE" ? "success" : "outline"}>{room.phase === "LIVE" ? "Live" : room.phase === "SCHEDULED" ? "Scheduled" : "Ended"}</Badge>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 p-5">
          <RoomTimer startsAt={room.startsAt.toISOString()} endsAt={room.endsAt.toISOString()} />
          {room.phase === "ENDED" ? (
            <p className="text-sm text-muted">This room has ended.</p>
          ) : inRoom ? (
            <div className="flex flex-col gap-2">
              {session ? (
                <Button asChild size="sm">
                  <Link href={`/study/${session.id}`}>Open my focus session</Link>
                </Button>
              ) : null}
              <LeaveRoomButton roomId={room.id} />
            </div>
          ) : access.canPost ? (
            <JoinRoomForm roomId={room.id} />
          ) : null}
        </Card>
        <section>
          <h2 className="mb-3 font-semibold">
            Here now · {room.present.length}
          </h2>
          {room.present.length ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {room.present.map((p) => (
                <li key={p.handle}>
                  <Card className="p-3">
                    <p className="font-medium">
                      {p.handle}
                      {p.me ? " (you)" : ""}
                    </p>
                    <p className="text-sm text-muted">{p.goal ?? "Focusing"}</p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nobody yet — join and others will see you here.</p>
          )}
          <p className="mt-3 text-xs text-muted">Updates every 30 seconds. People who close the page drop off after two minutes.</p>
        </section>
      </div>
    </div>
  );
}
