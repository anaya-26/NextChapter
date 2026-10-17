import "server-only";
import { z } from "zod";
import { registerJobHandler } from "./handlers";
import { runRoadmapEnrichment, runSyllabusExtraction } from "../services/syllabus";

const payload = z.object({ syllabusId: z.string() });

registerJobHandler("syllabus.extract", async (raw, ctx) => {
  const { syllabusId } = payload.parse(raw);
  return runSyllabusExtraction(syllabusId, ctx.progress);
});

registerJobHandler("roadmap.enrich", async (raw, ctx) => {
  const { syllabusId } = payload.parse(raw);
  await runRoadmapEnrichment(syllabusId, ctx.progress);
  return { ok: true };
});
