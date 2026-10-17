import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { addMaterials } from "@/server/services/sources";

/**
 * Study-material uploads (documents, slides, images, audio, video, captions). A route
 * handler rather than a Server Action so large media isn't limited by the action body size
 * and the browser can report upload progress.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload could not be read." }, { status: 400 });
  }
  const subjectId = String(form.get("subjectId") ?? "");
  const topicId = String(form.get("topicId") ?? "") || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!subjectId || !files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  try {
    const ids = await addMaterials(
      user.id,
      subjectId,
      await Promise.all(files.map(async (f) => ({ fileName: f.name, mime: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) }))),
      { topicId, language: String(form.get("language") ?? "") || null },
    );
    return NextResponse.json({ ok: true, sourceIds: ids });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
