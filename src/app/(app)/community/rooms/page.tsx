import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Timer } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { communityAccess, listGroups } from "@/server/services/community";
import { listRooms } from "@/server/services/focus-rooms";
import { localDateKey } from "@/lib/time";
import { CreateRoomButton } from "@/components/community/community-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Focus rooms" };

export default async function RoomsPage() {
  const user = await requireUser();
  const at = await now(user.id);
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const [rooms, groups, profile] = await Promise.all([listRooms(user.id, at), listGroups(user.id, at), getProfile(user.id)]);
  const create = access.canPost ? <CreateRoomButton groups={groups.filter((g) => g.myRole).map((g) => ({ id: g.id, name: g.name }))} todayKey={localDateKey(at, profile.timezone)} /> : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Focus rooms" description="Study alongside others. Everyone sees handles, goals and a shared timer — no chat, no camera, very little data." actions={create} />
      {rooms.length ? (
        <Card className="divide-y divide-border">
          {rooms.map((r) => (
            <Link key={r.id} href={`/community/rooms/${r.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted">
                  {r.host.communityProfile?.handle ?? "member"}
                  {r.group ? ` · ${r.group.name}` : ""} · {r.durationMinutes} min
                </p>
              </div>
              {r.phase === "LIVE" ? <Badge tone="success">Live · {r.hereNow} here</Badge> : <Badge tone="outline">{r.startsAt.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: profile.timezone })}</Badge>}
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState icon={Timer} title="No rooms right now" description="Start one and others in your groups (or your age bracket) can join." action={create} />
      )}
    </div>
  );
}
