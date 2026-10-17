import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { exportCardsTsv } from "@/server/services/flashcards";

/** The student's flashcards as tab-separated text (imports into Anki and most flashcard apps). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const topicId = new URL(request.url).searchParams.get("topicId") || undefined;
  const tsv = await exportCardsTsv(user.id, topicId);
  return new Response(tsv, {
    headers: {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "content-disposition": `attachment; filename="kadam-flashcards.tsv"`,
      "cache-control": "private, no-store",
    },
  });
}
