import { randomUUID } from "node:crypto";
import {
  GooglePreconditionError,
  SCOPE_APP_CREATED,
  SCOPE_FREEBUSY,
  type GoogleCalendarApi,
  type GoogleEvent,
  type GoogleEventInput,
  type GoogleOAuth,
} from "@/server/integrations/google-calendar";

/** In-memory stand-in for Google's OAuth and Calendar APIs (tests only). */
export function createFakeGoogle(opts: { scopes?: string[] } = {}) {
  const calendars = new Map<string, { summary: string; timeZone: string; events: Map<string, GoogleEvent> }>();
  const changeLog: { calendarId: string; eventId: string; seq: number }[] = [];
  let seq = 0;
  const busy: { start: string; end: string }[] = [];
  const revoked: string[] = [];

  const bump = (calendarId: string, ev: GoogleEvent) => {
    ev.etag = `"${++seq}"`;
    ev.updated = new Date().toISOString();
    changeLog.push({ calendarId, eventId: ev.id, seq });
  };

  const oauth: GoogleOAuth = {
    authUrl: (state) => `https://accounts.example/consent?state=${encodeURIComponent(state)}`,
    exchangeCode: async (code) => ({
      accessToken: `access-${code}`,
      refreshToken: `refresh-${code}`,
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: opts.scopes ?? [SCOPE_APP_CREATED, SCOPE_FREEBUSY],
    }),
    refresh: async () => ({ accessToken: "access-refreshed", refreshToken: null, expiresAt: new Date(Date.now() + 3600_000), scopes: [] }),
    revoke: async (token) => {
      revoked.push(token);
    },
  };

  const cal = (id: string) => {
    const c = calendars.get(id);
    if (!c) throw new Error(`No calendar ${id}`);
    return c;
  };

  const api: GoogleCalendarApi = {
    createCalendar: async (summary, timeZone) => {
      const id = `cal-${randomUUID().slice(0, 8)}@group.calendar.google.com`;
      calendars.set(id, { summary, timeZone, events: new Map() });
      return { id };
    },
    deleteCalendar: async (id) => {
      calendars.delete(id);
    },
    insertEvent: async (calendarId, input: GoogleEventInput) => {
      const ev = { ...structuredClone(input), id: `g-${randomUUID().slice(0, 8)}`, etag: "", updated: "", status: "confirmed" as const };
      bump(calendarId, ev);
      cal(calendarId).events.set(ev.id, ev);
      return structuredClone(ev);
    },
    patchEvent: async (calendarId, eventId, patch, etag) => {
      const ev = cal(calendarId).events.get(eventId);
      if (!ev) throw new Error("404");
      if (etag && etag !== ev.etag) throw new GooglePreconditionError();
      Object.assign(ev, structuredClone(patch));
      bump(calendarId, ev);
      return structuredClone(ev);
    },
    getEvent: async (calendarId, eventId) => {
      const ev = calendars.get(calendarId)?.events.get(eventId);
      return ev ? structuredClone(ev) : null;
    },
    deleteEvent: async (calendarId, eventId) => {
      const ev = cal(calendarId).events.get(eventId);
      if (ev) {
        ev.status = "cancelled";
        bump(calendarId, ev);
      }
    },
    listChanges: async (calendarId, syncToken) => {
      const since = syncToken ? Number(syncToken) : 0;
      const ids = [...new Set(changeLog.filter((c) => c.calendarId === calendarId && c.seq > since).map((c) => c.eventId))];
      return { items: ids.map((id) => structuredClone(cal(calendarId).events.get(id)!)), nextSyncToken: String(seq) };
    },
    freeBusy: async () => structuredClone(busy),
  };

  return {
    oauth,
    api,
    calendars,
    busy,
    revoked,
    /** Simulates the student editing an event inside Google Calendar. */
    editInGoogle(calendarId: string, eventId: string, patch: Partial<GoogleEventInput>) {
      const ev = cal(calendarId).events.get(eventId)!;
      Object.assign(ev, patch);
      bump(calendarId, ev);
    },
    createInGoogle(calendarId: string, input: GoogleEventInput) {
      const ev = { ...input, id: `g-${randomUUID().slice(0, 8)}`, etag: "", updated: "", status: "confirmed" as const };
      bump(calendarId, ev);
      cal(calendarId).events.set(ev.id, ev);
      return ev;
    },
    deleteInGoogle(calendarId: string, eventId: string) {
      const ev = cal(calendarId).events.get(eventId)!;
      ev.status = "cancelled";
      bump(calendarId, ev);
    },
  };
}
