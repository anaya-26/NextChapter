import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { now } from "@/server/clock";
import { sendMessage } from "@/server/services/companion";

/**
 * Sends a message to the companion and streams the reply as newline-delimited JSON:
 * {"type":"delta","text":"…"} … then {"type":"done", messageId, used, actions}.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/companion/[conversationId]/messages">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { conversationId } = await ctx.params;
  let content = "";
  try {
    content = String(((await request.json()) as { content?: unknown }).content ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!content.trim()) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  const at = await now(user.id);
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of sendMessage(user.id, conversationId, content, at)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Something went wrong" })}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
