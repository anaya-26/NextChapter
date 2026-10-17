import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { now } from "../clock";
import { registerJobHandler } from "./handlers";
import { enqueueJob } from "./queue";
import { dispatchAllReminders } from "../services/reminders";
import { syncNow } from "../services/calendar-sync";

/** Runs every minute (enqueued by the worker loop): reminders, missed sessions, sync and upkeep scheduling. */
registerJobHandler("reminders.dispatch", async () => {
  const realNow = new Date();
  const notifications = await dispatchAllReminders();
  // Planned sessions long past without being started are recorded as missed.
  await prisma.studySession.updateMany({ where: { status: "PLANNED", plannedStart: { lt: new Date(realNow.getTime() - 8 * 3600_000) } }, data: { status: "MISSED" } });
  // Google Calendar: pull changes and busy times every 15 minutes per connected student.
  const due = await prisma.calendarConnection.findMany({
    where: { status: "ACTIVE", OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(realNow.getTime() - 15 * 60_000) } }] },
    select: { userId: true },
  });
  for (const c of due) await enqueueJob("calendar.sync", { userId: c.userId }, { userId: c.userId, dedupeKey: `calendar-sync:${c.userId}`, maxAttempts: 2 });
  // Opportunities: expiry, permitted feeds and link checks every 6 hours.
  const lastUpkeep = await prisma.job.findFirst({ where: { type: "opportunities.maintain" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!lastUpkeep || lastUpkeep.createdAt < new Date(realNow.getTime() - 6 * 3600_000)) await enqueueJob("opportunities.maintain", {}, { dedupeKey: "opportunities:maintain", maxAttempts: 1 });
  await prisma.job.deleteMany({ where: { type: { in: ["reminders.dispatch", "opportunities.check"] }, status: "SUCCEEDED", finishedAt: { lt: new Date(realNow.getTime() - 86400000) } } });
  return { notifications, syncs: due.length };
});

registerJobHandler("calendar.sync", async (raw) => {
  const { userId } = z.object({ userId: z.string() }).parse(raw);
  return syncNow(userId, await now(userId));
});
