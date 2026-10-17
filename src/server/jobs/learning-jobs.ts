import "server-only";
import { z } from "zod";
import { registerJobHandler } from "./handlers";
import { processSource } from "../services/sources";
import { generateLesson } from "../services/lessons";
import { checkResourceLinks } from "../services/resources";

registerJobHandler("source.process", async (raw, ctx) => {
  const { sourceId } = z.object({ sourceId: z.string() }).parse(raw);
  return processSource(sourceId, ctx.progress);
});

registerJobHandler("lesson.generate", async (raw, ctx) => {
  const { topicId, mode } = z.object({ topicId: z.string(), mode: z.enum(["SIMPLE", "STANDARD", "DEEP", "EXAM"]) }).parse(raw);
  return generateLesson(topicId, mode, ctx.progress);
});

registerJobHandler("resources.check", async (raw) => {
  const { userId, ids } = z.object({ userId: z.string(), ids: z.array(z.string()) }).parse(raw);
  await checkResourceLinks(userId, ids);
  return { checked: ids.length };
});
