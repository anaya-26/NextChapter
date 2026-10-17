import "server-only";
import { z } from "zod";
import { registerJobHandler } from "./handlers";
import { rememberFromMessage } from "../services/companion";

registerJobHandler("companion.remember", async (raw) => {
  const { messageId } = z.object({ messageId: z.string() }).parse(raw);
  return rememberFromMessage(messageId);
});
