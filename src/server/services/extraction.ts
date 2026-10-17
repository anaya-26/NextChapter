import "server-only";
import path from "node:path";
import type { SourceKind } from "@/generated/prisma/client";
import { chunkCues, parseCaptions } from "@/lib/captions";
import { env } from "../env";
import { ocrImage, ocrLanguagesFor } from "./ocr";

export type Passage = { page: number | null; text: string; startSec?: number; endSec?: number; heading?: string };

export type Extracted = {
  passages: Passage[];
  method: string;
  pageCount?: number;
  durationSec?: number;
  confidence?: number;
  warnings: string[];
};

/** Raised when a file can't be processed without an integration that isn't configured. */
export class NeedsSetupError extends Error {}
/** Raised for unsupported or unreadable files. */
export class UnsupportedFileError extends Error {}

const EXT_KIND: Record<string, SourceKind> = {
  pdf: "PDF",
  docx: "DOCUMENT",
  txt: "TEXT",
  md: "TEXT",
  pptx: "SLIDES",
  png: "IMAGE",
  jpg: "IMAGE",
  jpeg: "IMAGE",
  webp: "IMAGE",
  gif: "IMAGE",
  vtt: "CAPTIONS",
  srt: "CAPTIONS",
  mp3: "AUDIO",
  m4a: "AUDIO",
  wav: "AUDIO",
  ogg: "AUDIO",
  webm: "AUDIO",
  mp4: "VIDEO",
  mov: "VIDEO",
  mkv: "VIDEO",
};

export const ACCEPTED_EXTENSIONS = Object.keys(EXT_KIND).map((e) => `.${e}`);

export function detectKind(fileName: string, mime: string): SourceKind | null {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (EXT_KIND[ext]) {
    // A .webm can be video; trust the browser's MIME type when it says so.
    if (ext === "webm" && mime.startsWith("video/")) return "VIDEO";
    return EXT_KIND[ext];
  }
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("text/")) return "TEXT";
  return null;
}

export function isMediaKind(kind: SourceKind) {
  return kind === "AUDIO" || kind === "VIDEO";
}

/** Split long text into passages of ~1,500 characters on paragraph boundaries. */
export function chunkText(text: string, target = 1500, page: number | null = null): Passage[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: Passage[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > target) {
      out.push({ page, text: cur });
      cur = "";
    }
    if (p.length > target * 1.6) {
      // Very long paragraph: split on sentences.
      for (const sentence of p.split(/(?<=[.!?।])\s+/)) {
        if (cur.length + sentence.length > target && cur) {
          out.push({ page, text: cur });
          cur = "";
        }
        cur += (cur ? " " : "") + sentence;
      }
    } else cur += (cur ? "\n\n" : "") + p;
  }
  if (cur) out.push({ page, text: cur });
  return out;
}

async function extractPdf(data: Buffer): Promise<Extracted> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const passages: Passage[] = [];
  text.forEach((pageText, i) => {
    for (const p of chunkText(pageText.replace(/[ \t]+\n/g, "\n"), 1800, i + 1)) passages.push(p);
  });
  const chars = text.reduce((s, t) => s + t.trim().length, 0);
  const warnings: string[] = [];
  if (chars / Math.max(1, totalPages) < 60) {
    warnings.push("This PDF looks scanned (very little selectable text). AI reading is needed for scanned pages; or upload photos of the pages.");
  }
  return { passages, method: "pdf-text", pageCount: totalPages, warnings };
}

async function extractDocx(data: Buffer): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const { value, messages } = await mammoth.extractRawText({ buffer: data });
  return {
    passages: chunkText(value),
    method: "docx-text",
    warnings: messages.filter((m) => m.type === "warning").slice(0, 3).map((m) => m.message),
  };
}

async function extractPptx(data: Buffer): Promise<Extracted> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const passages: Passage[] = [];
  for (const [i, f] of slides.entries()) {
    const xml = await zip.files[f].async("string");
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(" ").trim();
    if (text) passages.push({ page: i + 1, text, heading: `Slide ${i + 1}` });
  }
  return { passages, method: "pptx-text", pageCount: slides.length, warnings: passages.length ? [] : ["No text found on the slides."] };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function transcribe(data: Buffer, fileName: string, mime: string): Promise<Extracted> {
  const e = env();
  if (!e.transcriptionConfigured) {
    throw new NeedsSetupError(
      "Transcription isn't configured. Upload a caption file (.vtt or .srt) for this recording, or set TRANSCRIPTION_API_URL and TRANSCRIPTION_API_KEY.",
    );
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), fileName);
  form.append("model", e.TRANSCRIPTION_MODEL ?? "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch(`${e.TRANSCRIPTION_API_URL!.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${e.TRANSCRIPTION_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription service returned ${res.status}`);
  const json = (await res.json()) as { text?: string; duration?: number; segments?: { start: number; end: number; text: string }[] };
  const cues = (json.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  const passages = cues.length
    ? chunkCues(cues).map((c) => ({ page: null, text: c.text, startSec: c.start, endSec: c.end }))
    : chunkText(json.text ?? "");
  return { passages, method: "transcription", durationSec: json.duration ? Math.round(json.duration) : undefined, warnings: cues.length ? [] : ["The service returned no timestamps."] };
}

export async function extractFromFile(input: {
  kind: SourceKind;
  data: Buffer;
  fileName: string;
  mime: string;
  language?: string | null;
}): Promise<Extracted> {
  switch (input.kind) {
    case "PDF":
      return extractPdf(input.data);
    case "DOCUMENT":
      return extractDocx(input.data);
    case "SLIDES":
      return extractPptx(input.data);
    case "TEXT":
      return { passages: chunkText(input.data.toString("utf8")), method: "text", warnings: [] };
    case "CAPTIONS": {
      const cues = parseCaptions(input.data.toString("utf8"));
      if (!cues.length) throw new UnsupportedFileError("No captions could be read from this file.");
      return {
        passages: chunkCues(cues).map((c) => ({ page: null, text: c.text, startSec: c.start, endSec: c.end })),
        method: "captions",
        durationSec: Math.round(cues[cues.length - 1].end),
        warnings: [],
      };
    }
    case "IMAGE": {
      if (!env().OCR_LOCAL_ENABLED) throw new NeedsSetupError("Reading images needs AI (ANTHROPIC_API_KEY) or local OCR (OCR_LOCAL_ENABLED=true).");
      const { text, confidence } = await ocrImage(input.data, ocrLanguagesFor(input.language));
      const warnings = confidence < 75 ? [`Text recognition confidence was ${Math.round(confidence)}% — check the result against the original.`] : [];
      return { passages: chunkText(text), method: "local-ocr", confidence, warnings };
    }
    case "AUDIO":
    case "VIDEO":
      return transcribe(input.data, input.fileName, input.mime);
    default:
      throw new UnsupportedFileError("This file type isn't supported.");
  }
}
