import "server-only";
import type { SuggestedAction } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { SuggestionView } from "@/components/journal/journal-ui";

export function toSuggestionViews(items: SuggestedAction[]): SuggestionView[] {
  return items.map((s) => {
    const p = (s.payload ?? {}) as { by?: "AI" | "MOCK" | "RULES" };
    return { id: s.id, title: s.title, reason: s.reason, origin: s.origin, simulated: p.by === "MOCK", ai: p.by === "AI" || p.by === "MOCK" };
  });
}

/** Maps private storage keys to owner-only download ids. */
export async function fileIds(userId: string, keys: string[]) {
  if (!keys.length) return [];
  const files = await prisma.storedFile.findMany({ where: { userId, key: { in: keys } }, select: { id: true, key: true, mimeType: true } });
  return keys.map((k) => files.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f);
}
