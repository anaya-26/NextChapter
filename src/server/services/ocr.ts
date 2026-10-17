import "server-only";
import { copyFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Offline OCR with Tesseract (English, Hindi, Marathi). Language data ships with the
 * @tesseract.js-data packages, so no network download is needed at runtime.
 */

export type OcrLanguage = "eng" | "hin" | "mar";

const require = createRequire(import.meta.url);
const cacheDir = path.join(os.tmpdir(), "kadam-tessdata");

async function ensureLanguageData(langs: OcrLanguage[]) {
  await mkdir(cacheDir, { recursive: true });
  for (const lang of langs) {
    const target = path.join(cacheDir, `${lang}.traineddata.gz`);
    try {
      await stat(target);
      continue;
    } catch {}
    const pkgDir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    const best = path.join(pkgDir, "4.0.0_best_int", `${lang}.traineddata.gz`);
    const fast = path.join(pkgDir, "4.0.0", `${lang}.traineddata.gz`);
    try {
      await stat(best);
      await copyFile(best, target);
    } catch {
      await copyFile(fast, target);
    }
  }
}

export type OcrResult = { text: string; confidence: number };

export async function ocrImage(data: Buffer, langs: OcrLanguage[] = ["eng"]): Promise<OcrResult> {
  await ensureLanguageData(langs);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(langs.join("+"), 1, {
    langPath: cacheDir,
    cachePath: cacheDir,
    gzip: true,
    logger: () => {},
  });
  try {
    const { data: out } = await worker.recognize(data);
    return { text: out.text, confidence: out.confidence };
  } finally {
    await worker.terminate();
  }
}

export function ocrLanguagesFor(language: string | null | undefined): OcrLanguage[] {
  if (language === "hi") return ["eng", "hin"];
  if (language === "mr") return ["eng", "mar"];
  if (language === "mixed") return ["eng", "hin", "mar"];
  return ["eng"];
}
