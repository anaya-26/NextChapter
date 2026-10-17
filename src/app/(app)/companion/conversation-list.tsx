import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConversationList({ items, activeId }: { items: { id: string; title: string; updatedAt: Date; topic: { title: string } | null }[]; activeId?: string }) {
  if (!items.length) return <p className="text-sm text-muted">No conversations yet.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={`/companion/${c.id}`}
            aria-current={c.id === activeId ? "page" : undefined}
            className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2", c.id === activeId && "bg-primary-soft text-primary-soft-fg")}
          >
            <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.title}</span>
              {c.topic ? <span className="block truncate text-xs text-muted">Topic: {c.topic.title}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
