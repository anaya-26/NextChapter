"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/server/session";
import { updateProfile } from "@/server/services/profile";
import { createConversation, deleteConversation } from "@/server/services/companion";

const CONTEXTS = ["GENERAL", "TOPIC", "PLANNING", "REFLECTION", "CAREER", "RESTART"] as const;

export async function newConversationAction(input: { context?: (typeof CONTEXTS)[number]; topicId?: string | null; message?: string }) {
  const user = await requireUser();
  const context = CONTEXTS.includes(input.context ?? "GENERAL") ? (input.context ?? "GENERAL") : "GENERAL";
  const c = await createConversation(user.id, { context, topicId: input.topicId ?? null });
  redirect(`/companion/${c.id}${input.message ? `?send=${encodeURIComponent(input.message.slice(0, 400))}` : ""}`);
}

export async function deleteConversationAction(id: string) {
  const user = await requireUser();
  await deleteConversation(user.id, id);
  redirect("/companion");
}

export async function updateCoachingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = z
    .object({
      companionTone: z.coerce.number().int().min(0).max(100),
      coachingIntensity: z.enum(["GENTLE", "BALANCED", "FIRM"]),
      reminderFrequency: z.enum(["OFF", "MINIMAL", "NORMAL", "FREQUENT"]),
    })
    .safeParse({ companionTone: form.get("companionTone"), coachingIntensity: form.get("coachingIntensity"), reminderFrequency: form.get("reminderFrequency") });
  if (!r.success) return fail("Please check your choices.");
  await updateProfile(user.id, r.data);
  refresh();
  return { ok: true, message: "Companion settings saved" };
}
