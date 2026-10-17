import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/session";
import { now } from "@/server/clock";
import { completeConnection, verifyConnectState } from "@/server/services/calendar-sync";

const NONCE_COOKIE = "nextchapter_gcal_nonce";

/** Google redirects here after consent; the state must match this browser and signed-in student. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/calendar/sync", request.url));
  const params = request.nextUrl.searchParams;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/calendar/sync?${q}`, request.url));
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/integrations/google-calendar" });
    return res;
  };
  if (params.get("error")) return back("error=denied");
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (!code || !verifyConnectState(state, user.id, request.cookies.get(NONCE_COOKIE)?.value)) return back("error=state");
  try {
    await completeConnection(user.id, code, await now(user.id));
  } catch (error) {
    console.error("[google-calendar] connect failed", error instanceof Error ? error.message : error);
    return back(error instanceof Error && /permission/i.test(error.message) ? "error=scope" : "error=failed");
  }
  return back("connected=1");
}
