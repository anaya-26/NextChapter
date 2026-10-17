import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { now } from "@/server/clock";
import { exportIcs } from "@/server/services/calendar";

/** The student's NextChapter calendar as an .ics download (imports into Google, Apple or Outlook calendars). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ics = await exportIcs(user.id, await now(user.id));
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="nextchapter-calendar.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
