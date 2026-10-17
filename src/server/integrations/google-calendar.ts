import "server-only";
import { env } from "../env";

/**
 * Minimal Google Calendar REST client. NextChapter asks for two narrow scopes only:
 * - calendar.app.created: create a separate "NextChapter — study plan" calendar and manage events
 *   in it (NextChapter can't read or change the student's other calendars), and
 * - calendar.freebusy: see when the student is busy (no event titles or details).
 */
export const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.app.created", "https://www.googleapis.com/auth/calendar.freebusy"] as const;
export const SCOPE_APP_CREATED = GOOGLE_CALENDAR_SCOPES[0];
export const SCOPE_FREEBUSY = GOOGLE_CALENDAR_SCOPES[1];

export type GoogleTime = { dateTime?: string; date?: string; timeZone?: string };

export type GoogleEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleTime;
  end: GoogleTime;
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: { method: "popup"; minutes: number }[] };
  extendedProperties?: { private: Record<string, string> };
};

export type GoogleEvent = GoogleEventInput & { id: string; etag: string; updated: string; status: "confirmed" | "tentative" | "cancelled" };

export class GooglePreconditionError extends Error {
  constructor() {
    super("The event was changed in Google Calendar since NextChapter last saw it.");
  }
}
export class GoogleGoneError extends Error {
  constructor() {
    super("Sync token expired");
  }
}
export class GoogleAuthError extends Error {}

export interface GoogleCalendarApi {
  createCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
  deleteCalendar(calendarId: string): Promise<void>;
  insertEvent(calendarId: string, event: GoogleEventInput): Promise<GoogleEvent>;
  patchEvent(calendarId: string, eventId: string, event: Partial<GoogleEventInput>, etag?: string | null): Promise<GoogleEvent>;
  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | null>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  listChanges(calendarId: string, syncToken: string | null): Promise<{ items: GoogleEvent[]; nextSyncToken: string | null }>;
  freeBusy(timeMin: Date, timeMax: Date, calendarIds: string[]): Promise<{ start: string; end: string }[]>;
}

export type GoogleTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date; scopes: string[] };

export interface GoogleOAuth {
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleTokens>;
  refresh(refreshToken: string): Promise<GoogleTokens>;
  revoke(token: string): Promise<void>;
}

export function redirectUri() {
  return `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/api/integrations/google-calendar/callback`;
}

function tokensFrom(json: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }): GoogleTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
    scopes: (json.scope ?? "").split(" ").filter(Boolean),
  };
}

export const realGoogleOAuth: GoogleOAuth = {
  authUrl(state) {
    const e = env();
    const params = new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
  async exchangeCode(code) {
    const e = env();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: e.GOOGLE_CLIENT_ID ?? "", client_secret: e.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    });
    if (!res.ok) throw new GoogleAuthError(`Google sign-in failed (${res.status})`);
    return tokensFrom(await res.json());
  },
  async refresh(refreshToken) {
    const e = env();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: e.GOOGLE_CLIENT_ID ?? "", client_secret: e.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token" }),
    });
    if (!res.ok) throw new GoogleAuthError(res.status === 400 || res.status === 401 ? "Google access was removed — please reconnect." : `Token refresh failed (${res.status})`);
    return tokensFrom(await res.json());
  },
  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
  },
};

const BASE = "https://www.googleapis.com/calendar/v3";

/** REST client; `getToken` returns a valid access token (refreshing as needed). */
export function realGoogleCalendarApi(getToken: () => Promise<string>): GoogleCalendarApi {
  async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 412) throw new GooglePreconditionError();
    if (res.status === 410) throw new GoogleGoneError();
    if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`Google Calendar refused the request (${res.status}).`);
    if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const cal = (id: string) => encodeURIComponent(id);
  return {
    createCalendar: (summary, timeZone) => call("POST", "/calendars", { summary, timeZone, description: "Study plan managed by NextChapter. Changes you make here are shown in NextChapter for approval." }),
    deleteCalendar: async (calendarId) => {
      await call("DELETE", `/calendars/${cal(calendarId)}`).catch((e) => {
        if (!(e instanceof GoogleGoneError)) throw e;
      });
    },
    insertEvent: (calendarId, event) => call("POST", `/calendars/${cal(calendarId)}/events`, event),
    patchEvent: (calendarId, eventId, event, etag) => call("PATCH", `/calendars/${cal(calendarId)}/events/${cal(eventId)}`, event, etag ? { "if-match": etag } : {}),
    getEvent: async (calendarId, eventId) => {
      try {
        return await call<GoogleEvent>("GET", `/calendars/${cal(calendarId)}/events/${cal(eventId)}`);
      } catch (e) {
        if (e instanceof GoogleGoneError) return null;
        throw e;
      }
    },
    deleteEvent: async (calendarId, eventId) => {
      await call("DELETE", `/calendars/${cal(calendarId)}/events/${cal(eventId)}`).catch((e) => {
        if (!(e instanceof GoogleGoneError)) throw e;
      });
    },
    listChanges: async (calendarId, syncToken) => {
      const items: GoogleEvent[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | null = null;
      do {
        const q = new URLSearchParams({ maxResults: "250", showDeleted: "true", ...(syncToken ? { syncToken } : {}), ...(pageToken ? { pageToken } : {}) });
        const page = await call<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>("GET", `/calendars/${cal(calendarId)}/events?${q}`);
        items.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return { items, nextSyncToken };
    },
    freeBusy: async (timeMin, timeMax, calendarIds) => {
      const res = await call<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>("POST", "/freeBusy", {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      });
      return Object.values(res.calendars ?? {}).flatMap((c) => c.busy ?? []);
    },
  };
}

/* Test seams: integration tests install in-memory fakes; production uses the real clients. */
let oauthOverride: GoogleOAuth | null = null;
let apiOverride: ((connectionId: string) => GoogleCalendarApi) | null = null;

export function setGoogleTestDoubles(doubles: { oauth?: GoogleOAuth | null; api?: ((connectionId: string) => GoogleCalendarApi) | null }) {
  if (process.env.NODE_ENV === "production") throw new Error("Test doubles are not allowed in production");
  if ("oauth" in doubles) oauthOverride = doubles.oauth ?? null;
  if ("api" in doubles) apiOverride = doubles.api ?? null;
}

export function googleOAuth(): GoogleOAuth {
  return oauthOverride ?? realGoogleOAuth;
}

export function googleApiOverride() {
  return apiOverride;
}
