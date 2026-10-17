import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { MarkAllRead, MarkRead } from "@/components/notifications-ui";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const [at, profile] = await Promise.all([now(user.id), getProfile(user.id)]);
  const items = await prisma.notification.findMany({
    where: { userId: user.id, dueAt: { lte: at } },
    orderBy: { dueAt: "desc" },
    take: 60,
  });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Notifications"
        description="Reminders, revision prompts and updates. Adjust how often you hear from Kadam in Settings → Your companion."
        actions={unread ? <MarkAllRead /> : null}
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="All caught up" description="Reminders you set and revision prompts will appear here." />
      ) : (
        <Card className="divide-y divide-border">
          {items.map((n) => (
            <div key={n.id} className={cn("flex items-start gap-3 p-4", !n.readAt && "bg-primary-soft/30")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.title}</p>
                {n.body ? <p className="text-sm text-muted">{n.body}</p> : null}
                <p className="mt-1 text-xs text-subtle">{formatInTz(n.dueAt, profile.timezone, { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n.link ? (
                  <Link href={n.link} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Open
                  </Link>
                ) : null}
                {!n.readAt ? <MarkRead id={n.id} /> : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
