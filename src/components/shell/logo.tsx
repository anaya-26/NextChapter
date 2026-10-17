import { cn } from "@/lib/utils";

/** Original mark: an open book with its page turning to the next chapter, and a marigold bookmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M5.5 10.8c3.6-1.2 7.2-.8 10.5 1.3v12.1c-3.3-2-6.9-2.4-10.5-1.3Z" fill="var(--primary-fg)" opacity=".95" />
      <path d="M16 12.1c3.3-2.1 6.9-2.5 10.5-1.3v12.1c-3.6-1.1-7.2-.7-10.5 1.3Z" fill="var(--primary-fg)" opacity=".7" />
      <path d="M16 12.1c1.9-3 4.6-4.7 8-5.1-1.3 3.5-1.6 7.3-.9 11.2-2.9.2-5.2 1.3-7.1 3.4Z" fill="var(--primary-fg)" />
      <path d="M8.6 9.9v5.6l1.6-1.2 1.6 1.2v-5.4" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      {showName ? <span className="text-lg">NextChapter</span> : null}
    </span>
  );
}
