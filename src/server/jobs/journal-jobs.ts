import "server-only";
import { z } from "zod";
import { registerJobHandler } from "./handlers";
import { analyzeEntry, transcribeEntry } from "../services/journal";

registerJobHandler("journal.analyze", async (raw) => {
  const { entryId } = z.object({ entryId: z.string() }).parse(raw);
  return analyzeEntry(entryId);
});

registerJobHandler("journal.transcribe", async (raw) => {
  const { entryId } = z.object({ entryId: z.string() }).parse(raw);
  return transcribeEntry(entryId);
});
