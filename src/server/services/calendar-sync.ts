import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CalendarConnection, CalendarEvent, EventKind, Prisma } from "@/generated/prisma/client";
import { formatInTz, localDateKey, zonedToUtc } from "@/lib/time";
import { prisma } from "../db";
import { env } from "../env";
import { decryptSecret, encryptSecret, randomToken } from "../crypto";
import {
  GoogleGoneError,
  GooglePreconditionError,
  SCOPE_APP_CREATED,
  SCOPE_FREEBUSY,
  googleApiOverride,
  googleOAuth,
  realGoogleCalendarApi,
  type GoogleCalendarApi,
  type GoogleEvent,
  type GoogleEventInput,
} from "../integrations/google-calendar";

/**
 * Two-way sync between Kadam and a separate "Kadam — study plan" calendar in the student's
 * Google account. Nothing is written in either direction without a previewed change the
 * student approves; conflicts are shown side by side. Busy times from the student's main
 * calendar are read (free/busy only) so plans avoid them.
 */

export const SYNCABLE_KINDS: EventKind[] = ["REVISION", "STUDY", "EXAM", "ASSIGNMENT", "CLASS", "PROJECT", "FOCUS", "APPLICATION", "PERSONAL", "REMINDER"];

/* ── OAuth state ──────────────────────────────────────────────────── */

function sign(value: string) {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(value).digest("base64url");
}

/** Signed, expiring state bound to the user and a browser nonce (stored in a cookie). */
export function createConnectState(userId: string) {
  const nonce = randomToken(16);
  const payload = `${userId}.${nonce}.${Date.now() + 10 * 60_000}`;
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function verifyConnectState(state: string, userId: string, nonce: string | undefined) {
  const parts = state.split(".");
  if (parts.length !== 4 || !nonce) return false;
  const [uid, n, exp, sig] = parts;
  const expected = sign(`${uid}.${n}.${exp}`);
  const ok = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok && uid === userId && n === nonce && Number(exp) > Date.now();
}

/* ── Connection ───────────────────────────────────────────────────── */

export async function getConnection(userId: string) {
  return prisma.calendarConnection.findUnique({ where: { userId } });
}

function apiFor(conn: CalendarConnection): GoogleCalendarApi {
  const override = googleApiOverride();
  if (override) return override(conn.id);
  let cached: { token: string; expiresAt: Date } | null = conn.accessTokenEnc && conn.tokenExpiresAt ? { token: decryptSecret(conn.accessTokenEnc), expiresAt: conn.tokenExpiresAt } : null;
  return realGoogleCalendarApi(async () => {
    if (cached && cached.expiresAt.getTime() > Date.now() + 30_000) return cached.token;
    if (!conn.refreshTokenEnc) throw new Error("Google access expired — please reconnect.");
    const fresh = await googleOAuth().refresh(decryptSecret(conn.refreshTokenEnc));
    cached = { token: fresh.accessToken, expiresAt: fresh.expiresAt };
    await prisma.calendarConnection.update({ where: { id: conn.id }, data: { accessTokenEnc: encryptSecret(fresh.accessToken), tokenExpiresAt: fresh.expiresAt } });
    return fresh.accessToken;
  });
}

export async function completeConnection(userId: string, code: string, at: Date) {
  const tokens = await googleOAuth().exchangeCode(code);
  if (!tokens.scopes.includes(SCOPE_APP_CREATED)) {
    await googleOAuth().revoke(tokens.accessToken);
    throw new Error("Kadam needs permission to manage its own study calendar. Please try again and allow it.");
  }
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId } });
  const existing = await getConnection(userId);
  const data = {
    grantedScopes: tokens.scopes,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : (existing?.refreshTokenEnc ?? null),
    tokenExpiresAt: tokens.expiresAt,
    readBusy: tokens.scopes.includes(SCOPE_FREEBUSY),
    status: "ACTIVE" as const,
    lastError: null,
  };
  let conn = existing
    ? await prisma.calendarConnection.update({ where: { userId }, data })
    : await prisma.calendarConnection.create({ data: { userId, provider: "google", ...data } });
  if (!conn.studyCalendarId) {
    const calendar = await apiFor(conn).createCalendar("Kadam — study plan", profile.timezone);
    conn = await prisma.calendarConnection.update({ where: { id: conn.id }, data: { studyCalendarId: calendar.id } });
  }
  await queuePushChanges(userId, at);
  if (conn.readBusy) await refreshBusy(userId, at).catch(() => undefined);
  return conn;
}

export async function updateSyncKinds(userId: string, kinds: EventKind[]) {
  const conn = await getConnection(userId);
  if (!conn) return null;
  return prisma.calendarConnection.update({ where: { id: conn.id }, data: { syncKinds: kinds.filter((k) => SYNCABLE_KINDS.includes(k)) } });
}

export async function disconnect(userId: string, opts: { deleteGoogleCalendar: boolean }) {
  const conn = await getConnection(userId);
  if (!conn) return false;
  if (opts.deleteGoogleCalendar && conn.studyCalendarId && conn.status === "ACTIVE") {
    await apiFor(conn)
      .deleteCalendar(conn.studyCalendarId)
      .catch(() => undefined);
  }
  const token = conn.refreshTokenEnc ? decryptSecret(conn.refreshTokenEnc) : conn.accessTokenEnc ? decryptSecret(conn.accessTokenEnc) : null;
  if (token) await googleOAuth().revoke(token);
  await prisma.$transaction([
    prisma.calendarConnection.delete({ where: { id: conn.id } }),
    prisma.busyBlock.deleteMany({ where: { userId } }),
    prisma.calendarEvent.updateMany({
      where: { userId },
      data: { externalId: null, externalEtag: null, externalUpdatedAt: null, syncState: "LOCAL_ONLY", lastSyncedAt: null },
    }),
    prisma.calendarEvent.updateMany({ where: { userId, source: "GOOGLE" }, data: { source: "LOCAL" } }),
  ]);
  return true;
}

/* ── Push (Kadam → Google) ────────────────────────────────────────── */

function toGoogle(e: CalendarEvent): GoogleEventInput {
  const time = (d: Date): { dateTime?: string; date?: string; timeZone?: string } =>
    e.allDay ? { date: localDateKey(d, e.timezone) } : { dateTime: d.toISOString(), timeZone: e.timezone };
  return {
    summary: e.title,
    description: [e.description, "Planned with Kadam."].filter(Boolean).join("\n\n"),
    location: e.location ?? undefined,
    start: time(e.startAt),
    end: time(e.endAt),
    recurrence: e.rrule ? [`RRULE:${e.rrule}`] : undefined,
    reminders: e.reminderMinutes.length ? { useDefault: false, overrides: e.reminderMinutes.slice(0, 5).map((m) => ({ method: "popup", minutes: m })) } : { useDefault: false },
    extendedProperties: { private: { kadamId: e.id } },
  };
}

function describeWhen(e: Pick<CalendarEvent, "startAt" | "timezone" | "allDay">) {
  return formatInTz(e.startAt, e.timezone, e.allDay ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function wantsSync(conn: CalendarConnection, e: CalendarEvent) {
  return conn.status === "ACTIVE" && !e.syncOptOut && conn.syncKinds.includes(e.kind) && e.source !== "GOOGLE";
}

/** Proposes (but does not apply) Google changes for events that are new or changed in Kadam. */
export async function queuePushChanges(userId: string, at: Date) {
  const conn = await getConnection(userId);
  if (!conn || conn.status !== "ACTIVE") return 0;
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      syncOptOut: false,
      kind: { in: conn.syncKinds },
      source: { not: "GOOGLE" },
      status: { not: "CANCELLED" },
      syncState: { in: ["LOCAL_ONLY", "PENDING_PUSH"] },
      OR: [{ endAt: { gte: new Date(at.getTime() - 86400000) } }, { rrule: { not: null } }],
    },
  });
  let queued = 0;
  for (const e of events) {
    queued += (await queueEventPush(conn, e)) ? 1 : 0;
  }
  return queued;
}

async function queueEventPush(conn: CalendarConnection, e: CalendarEvent) {
  const pending = await prisma.calendarChange.findFirst({ where: { connectionId: conn.id, eventId: e.id, status: { in: ["PENDING", "CONFLICT"] }, direction: "PUSH" } });
  const op = e.externalId ? "UPDATE" : "CREATE";
  const summary = `${op === "CREATE" ? "Add" : "Update"} “${e.title}” · ${describeWhen(e)}`;
  if (pending) {
    if (pending.status === "PENDING") await prisma.calendarChange.update({ where: { id: pending.id }, data: { op, summary } });
    return false;
  }
  await prisma.$transaction([
    prisma.calendarChange.create({ data: { userId: e.userId, connectionId: conn.id, eventId: e.id, direction: "PUSH", op, summary, payload: {} } }),
    prisma.calendarEvent.update({ where: { id: e.id }, data: { syncState: "PENDING_PUSH" } }),
  ]);
  return true;
}

/** Called after any local create/update: synced events become "changed — awaiting approval". */
export async function afterLocalEventChange(userId: string, eventId: string) {
  const conn = await getConnection(userId);
  if (!conn) return;
  const e = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!e || !wantsSync(conn, e)) return;
  if (e.syncState === "SYNCED" || e.syncState === "LOCAL_ONLY") await prisma.calendarEvent.update({ where: { id: e.id }, data: { syncState: "PENDING_PUSH" } });
  await queueEventPush(conn, { ...e, syncState: "PENDING_PUSH" });
}

/** Called before a local delete: a copy in Google gets a previewed delete. */
export async function beforeLocalEventDelete(userId: string, e: CalendarEvent) {
  const conn = await getConnection(userId);
  if (!conn) return;
  await prisma.calendarChange.deleteMany({ where: { connectionId: conn.id, eventId: e.id, status: "PENDING", op: "CREATE" } });
  if (!e.externalId) return;
  await prisma.calendarChange.create({
    data: { userId, connectionId: conn.id, eventId: null, direction: "PUSH", op: "DELETE", summary: `Remove “${e.title}” · ${describeWhen(e)}`, payload: { externalId: e.externalId } },
  });
}

/* ── Pull (Google → Kadam) ────────────────────────────────────────── */

function fromGoogleTime(t: { dateTime?: string; date?: string }, tz: string) {
  return t.dateTime ? new Date(t.dateTime) : zonedToUtc(t.date!, "00:00", tz);
}

/** Reads changes made in the Kadam calendar inside Google and proposes them for approval. */
export async function pullRemote(userId: string, at: Date) {
  const conn = await getConnection(userId);
  if (!conn?.studyCalendarId || conn.status !== "ACTIVE") return 0;
  const api = apiFor(conn);
  let changes: { items: GoogleEvent[]; nextSyncToken: string | null };
  try {
    changes = await api.listChanges(conn.studyCalendarId, conn.syncToken);
  } catch (e) {
    if (!(e instanceof GoogleGoneError)) throw e;
    changes = await api.listChanges(conn.studyCalendarId, null);
  }
  let proposed = 0;
  for (const item of changes.items) {
    const local = await prisma.calendarEvent.findFirst({ where: { userId, OR: [{ externalId: item.id }, ...(item.extendedProperties?.private?.kadamId ? [{ id: item.extendedProperties.private.kadamId }] : [])] } });
    if (local && local.externalEtag === item.etag) continue;
    const already = await prisma.calendarChange.findFirst({ where: { connectionId: conn.id, direction: "PULL", status: { in: ["PENDING", "CONFLICT"] }, payload: { path: ["googleId"], equals: item.id } } });
    if (already) continue;
    const startAt = item.start ? fromGoogleTime(item.start, local?.timezone ?? "Asia/Kolkata") : null;
    const endAt = item.end ? fromGoogleTime(item.end, local?.timezone ?? "Asia/Kolkata") : null;
    const payload = { googleId: item.id, etag: item.etag, title: item.summary ?? "(no title)", startAt: startAt?.toISOString() ?? null, endAt: endAt?.toISOString() ?? null, allDay: !!item.start?.date } as Prisma.InputJsonValue;
    if (item.status === "cancelled") {
      if (!local || local.status === "CANCELLED") continue;
      await prisma.calendarChange.create({ data: { userId, connectionId: conn.id, eventId: local.id, direction: "PULL", op: "DELETE", summary: `Deleted in Google: “${local.title}”`, payload } });
    } else if (local) {
      const localChanged = local.syncState === "PENDING_PUSH" || (local.lastSyncedAt != null && local.updatedAt > local.lastSyncedAt);
      const when = startAt ? formatInTz(startAt, local.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
      await prisma.calendarChange.create({
        data: {
          userId,
          connectionId: conn.id,
          eventId: local.id,
          direction: "PULL",
          op: "UPDATE",
          summary: `Changed in Google: “${item.summary ?? local.title}” · ${when}`,
          payload,
          status: localChanged ? "CONFLICT" : "PENDING",
          conflictDetail: localChanged ? ({ kadam: { title: local.title, startAt: local.startAt.toISOString(), endAt: local.endAt.toISOString() }, google: payload } as Prisma.InputJsonValue) : undefined,
        },
      });
      if (localChanged) await prisma.calendarEvent.update({ where: { id: local.id }, data: { syncState: "CONFLICT" } });
    } else {
      await prisma.calendarChange.create({ data: { userId, connectionId: conn.id, eventId: null, direction: "PULL", op: "CREATE", summary: `New in Google: “${item.summary ?? "(no title)"}”`, payload } });
    }
    proposed++;
  }
  await prisma.calendarConnection.update({ where: { id: conn.id }, data: { syncToken: changes.nextSyncToken, lastSyncedAt: at, lastError: null } });
  return proposed;
}

/** Replaces cached busy times from the student's main Google calendar (free/busy only). */
export async function refreshBusy(userId: string, at: Date, days = 14) {
  const conn = await getConnection(userId);
  if (!conn?.readBusy || conn.status !== "ACTIVE") return 0;
  const until = new Date(at.getTime() + days * 86400000);
  const busy = await apiFor(conn).freeBusy(at, until, ["primary"]);
  await prisma.$transaction([
    prisma.busyBlock.deleteMany({ where: { userId, source: "google" } }),
    prisma.busyBlock.createMany({ data: busy.map((b) => ({ userId, startAt: new Date(b.start), endAt: new Date(b.end), source: "google", fetchedAt: at })) }),
  ]);
  return busy.length;
}

export async function syncNow(userId: string, at: Date) {
  const conn = await getConnection(userId);
  if (!conn) return null;
  try {
    const pulled = await pullRemote(userId, at);
    const busy = await refreshBusy(userId, at);
    const pushed = await queuePushChanges(userId, at);
    return { pulled, busy, pushed };
  } catch (error) {
    await prisma.calendarConnection.update({ where: { id: conn.id }, data: { lastError: error instanceof Error ? error.message : "Sync failed", status: error instanceof Error && /reconnect|refused/i.test(error.message) ? "ERROR" : conn.status } });
    throw error;
  }
}

/* ── Applying approved changes ────────────────────────────────────── */

export async function listChanges(userId: string) {
  return prisma.calendarChange.findMany({ where: { userId, status: { in: ["PENDING", "CONFLICT", "FAILED"] } }, orderBy: { createdAt: "asc" }, include: { event: true } });
}

export async function applyChanges(userId: string, ids: string[] | "all", at: Date) {
  const conn = await getConnection(userId);
  if (!conn?.studyCalendarId) throw new Error("Google Calendar isn't connected");
  const api = apiFor(conn);
  // Explicitly chosen failed changes are retried.
  if (ids !== "all") await prisma.calendarChange.updateMany({ where: { userId, id: { in: ids }, status: "FAILED" }, data: { status: "PENDING", error: null } });
  const changes = await prisma.calendarChange.findMany({
    where: { userId, status: "PENDING", ...(ids === "all" ? {} : { id: { in: ids } }) },
    include: { event: true },
    orderBy: { createdAt: "asc" },
  });
  const result = { applied: 0, conflicts: 0, failed: 0 };
  for (const c of changes) {
    try {
      const p = c.payload as { externalId?: string; googleId?: string; etag?: string; title?: string; startAt?: string; endAt?: string; allDay?: boolean };
      if (c.direction === "PUSH") {
        if (c.op === "DELETE") {
          if (p.externalId) await api.deleteEvent(conn.studyCalendarId, p.externalId);
        } else if (c.event) {
          const g = c.op === "CREATE" || !c.event.externalId
            ? await api.insertEvent(conn.studyCalendarId, toGoogle(c.event))
            : await api.patchEvent(conn.studyCalendarId, c.event.externalId, toGoogle(c.event), c.event.externalEtag);
          await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { externalId: g.id, externalEtag: g.etag, externalUpdatedAt: new Date(g.updated), syncState: "SYNCED", lastSyncedAt: at } });
        }
      } else if (c.op === "CREATE") {
        const created = await prisma.calendarEvent.create({
          data: {
            userId,
            title: p.title ?? "(no title)",
            kind: "PERSONAL",
            startAt: new Date(p.startAt!),
            endAt: new Date(p.endAt!),
            allDay: !!p.allDay,
            source: "GOOGLE",
            externalId: p.googleId,
            externalEtag: p.etag,
            syncState: "SYNCED",
            lastSyncedAt: at,
            reminderMinutes: [],
          },
        });
        await prisma.calendarChange.update({ where: { id: c.id }, data: { eventId: created.id } });
      } else if (c.event && c.op === "UPDATE") {
        await prisma.calendarEvent.update({
          where: { id: c.event.id },
          data: { title: p.title, startAt: new Date(p.startAt!), endAt: new Date(p.endAt!), externalEtag: p.etag, syncState: "SYNCED", lastSyncedAt: at },
        });
        await prisma.studySession.updateMany({ where: { calendarEventId: c.event.id, status: "PLANNED" }, data: { plannedStart: new Date(p.startAt!) } });
      } else if (c.event && c.op === "DELETE") {
        await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { status: "CANCELLED", externalId: null, externalEtag: null, syncState: "LOCAL_ONLY", syncOptOut: true } });
      }
      await prisma.calendarChange.update({ where: { id: c.id }, data: { status: "APPLIED", resolvedAt: at } });
      result.applied++;
    } catch (error) {
      if (error instanceof GooglePreconditionError && c.event?.externalId) {
        const remote = await api.getEvent(conn.studyCalendarId, c.event.externalId);
        await prisma.calendarChange.update({
          where: { id: c.id },
          data: {
            status: "CONFLICT",
            conflictDetail: {
              kadam: { title: c.event.title, startAt: c.event.startAt.toISOString(), endAt: c.event.endAt.toISOString() },
              google: remote ? { title: remote.summary, startAt: remote.start?.dateTime ?? remote.start?.date ?? null, endAt: remote.end?.dateTime ?? remote.end?.date ?? null, etag: remote.etag } : null,
            } as Prisma.InputJsonValue,
          },
        });
        await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { syncState: "CONFLICT" } });
        result.conflicts++;
      } else {
        await prisma.calendarChange.update({ where: { id: c.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Failed" } });
        result.failed++;
      }
    }
  }
  return result;
}

/** Declines a proposed change; Kadam won't propose the same thing again. */
export async function rejectChange(userId: string, changeId: string, at: Date) {
  const c = await prisma.calendarChange.findFirst({ where: { id: changeId, userId, status: { in: ["PENDING", "FAILED", "CONFLICT"] } }, include: { event: true } });
  if (!c) return false;
  if (c.event) {
    if (c.direction === "PUSH" && c.op === "CREATE") await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { syncOptOut: true, syncState: "LOCAL_ONLY" } });
    else await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { syncState: c.event.externalId ? "SYNCED" : "LOCAL_ONLY", lastSyncedAt: at } });
  }
  await prisma.calendarChange.update({ where: { id: c.id }, data: { status: "REJECTED", resolvedAt: at } });
  return true;
}

/** Resolves a conflict by keeping either the Kadam or the Google version. */
export async function resolveConflict(userId: string, changeId: string, keep: "kadam" | "google", at: Date) {
  const c = await prisma.calendarChange.findFirst({ where: { id: changeId, userId, status: "CONFLICT" }, include: { event: true } });
  const conn = await getConnection(userId);
  if (!c?.event || !conn?.studyCalendarId) return false;
  const api = apiFor(conn);
  if (keep === "kadam") {
    const g = c.event.externalId
      ? await api.patchEvent(conn.studyCalendarId, c.event.externalId, toGoogle(c.event), null)
      : await api.insertEvent(conn.studyCalendarId, toGoogle(c.event));
    await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { externalId: g.id, externalEtag: g.etag, syncState: "SYNCED", lastSyncedAt: at } });
  } else {
    const remote = c.event.externalId ? await api.getEvent(conn.studyCalendarId, c.event.externalId) : null;
    if (remote && remote.status !== "cancelled") {
      await prisma.calendarEvent.update({
        where: { id: c.event.id },
        data: {
          title: remote.summary ?? c.event.title,
          startAt: fromGoogleTime(remote.start, c.event.timezone),
          endAt: fromGoogleTime(remote.end, c.event.timezone),
          externalEtag: remote.etag,
          syncState: "SYNCED",
          lastSyncedAt: at,
        },
      });
    } else {
      await prisma.calendarEvent.update({ where: { id: c.event.id }, data: { status: "CANCELLED", syncState: "LOCAL_ONLY", externalId: null, syncOptOut: true } });
    }
  }
  await prisma.calendarChange.update({ where: { id: c.id }, data: { status: "APPLIED", resolvedAt: at } });
  return true;
}
