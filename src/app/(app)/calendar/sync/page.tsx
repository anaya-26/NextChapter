import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Download, Eye, EyeOff, Lock } from "lucide-react";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { getProfile } from "@/server/services/profile";
import { getConnection, listChanges, SYNCABLE_KINDS } from "@/server/services/calendar-sync";
import { formatInTz } from "@/lib/time";
import { ApproveButton, ConflictButtons, DisconnectForm, RejectButton, SyncKindsForm, SyncNowButton } from "@/components/calendar/planning-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Google Calendar" };

const ERRORS: Record<string, string> = {
  "not-configured": "Google Calendar isn't set up on this server yet.",
  denied: "You didn't give permission, so nothing was connected.",
  state: "The connection request expired or didn't match — please try again.",
  failed: "Google didn't complete the connection. Please try again.",
  scope: "NextChapter needs permission to manage its own study calendar. Please try again and allow it.",
};

type ConflictSide = { title?: string | null; startAt?: string | null; endAt?: string | null } | null;

export default async function SyncPage(props: PageProps<"/calendar/sync">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const e = env();
  const [profile, conn] = await Promise.all([getProfile(user.id), getConnection(user.id)]);
  const changes = conn ? await listChanges(user.id) : [];
  const tz = profile.timezone;
  const pending = changes.filter((c) => c.status === "PENDING");
  const conflicts = changes.filter((c) => c.status === "CONFLICT");
  const failed = changes.filter((c) => c.status === "FAILED");
  const fmt = (iso?: string | null) => (iso ? formatInTz(new Date(iso), tz, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/calendar" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Calendar
          </Link>
        }
        title="Google Calendar"
        description="Optional. NextChapter’s own calendar works fully without it."
      />
      {typeof sp.error === "string" ? <Notice tone="danger">{ERRORS[sp.error] ?? ERRORS.failed}</Notice> : null}
      {sp.connected ? <Notice tone="success" title="Connected">Review the changes below — nothing is copied to Google until you approve it.</Notice> : null}
      {sp.disconnected ? <Notice tone="success">Disconnected. NextChapter no longer has access to your Google account.</Notice> : null}

      <Card className="p-4 sm:p-5">
        <SectionTitle>What NextChapter can and can’t see</SectionTitle>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Create one separate calendar, “NextChapter — study plan”, and add or change events in it — only after you approve each change.
          </li>
          <li className="flex gap-2">
            <Eye className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> See when you’re busy in your main calendar, so plans avoid those times.
          </li>
          <li className="flex gap-2">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> It can’t read your other events’ titles, details or guests, and can’t change your other calendars.
          </li>
          <li className="flex gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> Access tokens are stored encrypted on the server. Disconnect any time; you can also remove access from your Google account settings.
          </li>
        </ul>
      </Card>

      {!e.googleConfigured ? (
        <Notice tone="neutral" title="Not set up on this server">
          An administrator needs to add a Google OAuth client (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) with the Calendar API enabled. Meanwhile you can{" "}
          <a href="/api/calendar/ics" className="font-medium underline">
            download your calendar as an .ics file
          </a>{" "}
          and import it into Google, Apple or Outlook calendars.
        </Notice>
      ) : !conn ? (
        <Card className="flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="text-sm">Connect to see your NextChapter plan in Google Calendar on your phone, and to keep study sessions away from your other plans.</p>
          <a href="/api/integrations/google-calendar/connect" className={buttonVariants()}>
            Connect Google Calendar
          </a>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">Connected · “NextChapter — study plan”</p>
                <p className="text-sm text-muted">
                  {conn.lastSyncedAt ? `Last checked ${fmt(conn.lastSyncedAt.toISOString())}` : "Not checked yet"} · Busy times {conn.readBusy ? "on" : "not permitted"}
                </p>
              </div>
              <SyncNowButton />
            </div>
            {conn.status !== "ACTIVE" || conn.lastError ? <Notice tone="warning">{conn.lastError ?? "Google access needs to be renewed."} <a href="/api/integrations/google-calendar/connect" className="font-medium underline">Reconnect</a></Notice> : null}
          </Card>

          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <SectionTitle action={pending.length > 1 ? <ApproveButton ids="all" label={`Approve all ${pending.length}`} /> : null}>Changes waiting for you</SectionTitle>
            {pending.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pending.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                    <Badge tone={c.direction === "PUSH" ? "primary" : "info"}>{c.direction === "PUSH" ? "NextChapter → Google" : "Google → NextChapter"}</Badge>
                    <span className="min-w-0 flex-1">{c.summary}</span>
                    <ApproveButton ids={[c.id]} label="Apply" />
                    <RejectButton id={c.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing waiting. New and changed events of the kinds below will appear here for approval.</p>
            )}
          </Card>

          {conflicts.length ? (
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <SectionTitle>Conflicts</SectionTitle>
              {conflicts.map((c) => {
                const detail = (c.conflictDetail ?? {}) as { app?: ConflictSide; google?: ConflictSide };
                return (
                  <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-warning/40 p-3 text-sm">
                    <p className="font-medium">{c.summary}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-surface-2 p-2">
                        <p className="text-xs font-semibold uppercase text-muted">In NextChapter</p>
                        <p>{detail.app?.title}</p>
                        <p className="text-muted">{fmt(detail.app?.startAt)}</p>
                      </div>
                      <div className="rounded-lg bg-surface-2 p-2">
                        <p className="text-xs font-semibold uppercase text-muted">In Google</p>
                        <p>{detail.google?.title ?? "Deleted"}</p>
                        <p className="text-muted">{fmt(detail.google?.startAt)}</p>
                      </div>
                    </div>
                    <ConflictButtons id={c.id} />
                  </div>
                );
              })}
            </Card>
          ) : null}

          {failed.length ? (
            <Card className="flex flex-col gap-2 p-4 sm:p-5">
              <SectionTitle>Couldn’t apply</SectionTitle>
              {failed.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1">
                    {c.summary} — <span className="text-danger">{c.error}</span>
                  </span>
                  <ApproveButton ids={[c.id]} label="Try again" />
                  <RejectButton id={c.id} />
                </div>
              ))}
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <SectionTitle>What to copy to Google</SectionTitle>
            <SyncKindsForm selected={conn.syncKinds} kinds={SYNCABLE_KINDS} />
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle>Disconnect</SectionTitle>
            <DisconnectForm />
          </Card>
        </>
      )}
      <a href="/api/calendar/ics" className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
        <Download /> Download my calendar (.ics)
      </a>
    </div>
  );
}
