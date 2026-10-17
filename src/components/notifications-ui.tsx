"use client";

import { useTransition } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";

export function MarkRead({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(() => markNotificationRead(id))}>
      Mark read
    </Button>
  );
}

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => markAllNotificationsRead())}>
      Mark all read
    </Button>
  );
}
