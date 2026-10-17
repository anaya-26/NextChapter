"use server";

import { refresh } from "next/cache";
import { env } from "@/server/env";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { removeDemoData, seedDemoHistory } from "@/server/services/demo";
import { evaluateBadges } from "@/server/services/xp";
import { setModerator } from "@/server/services/moderation";

export async function loadDemoHistory() {
  const user = await requireUser();
  if (!env().ENABLE_DEMO_TOOLS) return { ok: false, message: "Demo tools are disabled (ENABLE_DEMO_TOOLS)." };
  const result = await seedDemoHistory(user.id, await now(user.id));
  refresh();
  return { ok: true, message: `Loaded labelled demo history (${result.topics} demo topics, ~3 months of activity).` };
}

export async function removeDemoHistory() {
  const user = await requireUser();
  await removeDemoData(user.id);
  await evaluateBadges(user.id, await now(user.id));
  refresh();
  return { ok: true, message: "All demo data removed." };
}

/** Development/demo only: lets a tester act as a community moderator. */
export async function toggleModeratorAction(on: boolean) {
  const user = await requireUser();
  if (!env().ENABLE_DEMO_TOOLS) return { ok: false, message: "Demo tools are disabled (ENABLE_DEMO_TOOLS)." };
  await setModerator(user.id, on === true);
  refresh();
  return { ok: true, message: on ? "You’re a moderator (demo). Join the community first if you haven’t." : "Moderator role removed" };
}
