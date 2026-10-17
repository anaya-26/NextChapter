import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { cvDocument, cvToText, markExported } from "@/server/services/cv";

/** Downloads a CV as Markdown or plain text (owner only). PDF comes from the browser’s print dialog. */
export async function GET(request: Request, ctx: RouteContext<"/api/cv/[cvId]/export">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cvId } = await ctx.params;
  const doc = await cvDocument(user.id, cvId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "txt" ? "txt" : "md";
  await markExported(user.id, cvId, new Date());
  const name = `${doc.name} CV ${doc.cv.title}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "cv";
  return new Response(cvToText(doc, format), {
    headers: {
      "content-type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.${format}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
