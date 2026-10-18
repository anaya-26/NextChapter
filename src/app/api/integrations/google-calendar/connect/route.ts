import { publicUrl } from "@/lib/public-url";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { env } from "@/server/env";
import { createConnectState } from "@/server/services/calendar-sync";
import { googleOAuth } from "@/server/integrations/google-calendar";

const NONCE_COOKIE = "nextchapter_gcal_nonce";

/** Starts Google's consent screen for the two narrow calendar scopes. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(publicUrl("/sign-in?next=/calendar/sync", request.url));
  if (!env().googleConfigured) return NextResponse.redirect(publicUrl("/calendar/sync?error=not-configured", request.url));
  const { state, nonce } = createConnectState(user.id);
  const res = NextResponse.redirect(googleOAuth().authUrl(state));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/integrations/google-calendar", maxAge: 600 });
  return res;
}
