import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/session";

/** Processing status for the student's own background jobs (polled by the UI). */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const job = await prisma.job.findFirst({
    where: { id, userId: user.id },
    select: { id: true, type: true, status: true, progress: true, message: true, lastError: true, attempts: true, maxAttempts: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job, { headers: { "cache-control": "no-store" } });
}
