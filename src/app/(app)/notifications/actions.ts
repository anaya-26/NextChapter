"use server";

import { refresh } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: await now(user.id) } });
  refresh();
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  const at = await now(user.id);
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, dueAt: { lte: at } }, data: { readAt: at } });
  refresh();
}
