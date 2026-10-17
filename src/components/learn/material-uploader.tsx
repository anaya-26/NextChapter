"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.vtt,.srt";

export function MaterialUploader({
  subjectId,
  topicId,
  docMb,
  mediaMb,
  transcription,
}: {
  subjectId: string;
  topicId?: string;
  docMb: number;
  mediaMb: number;
  transcription: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    form.set("subjectId", subjectId);
    if (topicId) form.set("topicId", topicId);
    for (const f of Array.from(files)) form.append("files", f);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      setProgress(null);
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        setMessage({ tone: "ok", text: `Uploaded ${files.length} file${files.length === 1 ? "" : "s"} — processing in the background.` });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: body.error ?? "Upload failed." });
      }
      if (input.current) input.current.value = "";
    };
    xhr.onerror = () => {
      setProgress(null);
      setMessage({ tone: "error", text: "Network error — check your connection and try again." });
    };
    setMessage(null);
    setProgress(0);
    xhr.send(form);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal py-2 text-left" onClick={() => input.current?.click()} disabled={progress !== null}>
          <Upload className="shrink-0" /> Upload notes, slides, PDFs, images, audio or video
        </Button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Study material files" onChange={(e) => upload(e.target.files)} />
      </div>
      {progress !== null ? <Progress value={progress} label="Upload progress" /> : null}
      {message ? <p className={message.tone === "ok" ? "text-sm text-success" : "text-sm font-medium text-danger"}>{message.text}</p> : null}
      <p className="text-xs text-muted">
        Documents and images up to {docMb} MB; audio and video up to {mediaMb} MB. {transcription ? "Recordings are transcribed with timestamps." : "To make recordings searchable, upload their captions (.vtt or .srt) alongside them — no transcription service is configured."} Originals stay available to you.
      </p>
    </div>
  );
}
