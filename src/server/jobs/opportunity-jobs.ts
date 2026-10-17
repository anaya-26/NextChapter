import "server-only";
import { z } from "zod";
import { registerJobHandler } from "./handlers";
import { checkOpportunityLinks, maintainOpportunities } from "../services/opportunities";

/** Every few hours: expire closed openings, refresh permitted feeds, re-check stale links. */
registerJobHandler("opportunities.maintain", async () => maintainOpportunities(new Date()));

registerJobHandler("opportunities.check", async (raw) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(50) }).parse(raw);
  await checkOpportunityLinks(ids, new Date());
  return { checked: ids.length };
});
