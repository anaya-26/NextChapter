import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FilePurpose } from "@/generated/prisma/client";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Private file storage on local disk, outside the public web root. Files are only ever
 * served through /api/files/[id], which checks ownership. Swap this module for an
 * S3-compatible implementation by keeping the same function signatures.
 */

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

// Storage paths are runtime data, not source files: keep the bundler from tracing them.
function root(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env().STORAGE_DIR);
}

function resolveKey(key: string): string {
  const full = path.resolve(/*turbopackIgnore: true*/ root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export type SaveFileInput = {
  userId: string;
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  data: Buffer;
};

export async function saveFile(input: SaveFileInput) {
  const ext = path.extname(input.fileName).slice(1).toLowerCase();
  const safeExt = SAFE_EXT.test(ext) ? `.${ext}` : "";
  const now = new Date();
  const key = path.posix.join(
    input.userId,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    `${randomUUID()}${safeExt}`,
  );
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.data);
  const record = await prisma.storedFile.create({
    data: {
      userId: input.userId,
      key,
      fileName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      purpose: input.purpose,
    },
  });
  return record;
}

export async function readFileBuffer(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function fileStream(key: string, range?: { start: number; end: number }) {
  const full = resolveKey(key);
  const info = await stat(full);
  return { stream: createReadStream(full, range), size: info.size };
}


export async function deleteFile(key: string) {
  await rm(resolveKey(key), { force: true });
  await prisma.storedFile.deleteMany({ where: { key } });
}

/** Ownership-checked lookup used by the download route. */
export async function getOwnedFile(userId: string, fileId: string) {
  return prisma.storedFile.findFirst({ where: { id: fileId, userId } });
}

export function uploadLimitBytes(kind: "document" | "media"): number {
  const mb = kind === "media" ? env().MAX_MEDIA_UPLOAD_MB : env().MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}
