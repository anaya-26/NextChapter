import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { fileStream, getOwnedFile } from "@/server/storage";
import { parseRange } from "@/lib/range";

/** Streams a private file to its owner only. Inline for viewing; ?download=1 to save. Supports byte ranges so recordings can seek. */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await getOwnedFile(user.id, id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const range = parseRange(request.headers.get("range"), file.sizeBytes);
  const { stream, size } = await fileStream(file.key, range ?? undefined);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = file.fileName.replace(/[^\w.\- ]+/g, "_");
  const headers: Record<string, string> = {
    "content-type": file.mimeType || "application/octet-stream",
    "content-length": String(range ? range.end - range.start + 1 : size),
    "accept-ranges": "bytes",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
    // Uploaded files never run scripts in our origin.
    "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  if (range) headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
