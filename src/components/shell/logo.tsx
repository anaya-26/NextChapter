import { cn } from "@/lib/utils";

/** Original mark: a footstep-shaped leaf with a kadamba-flower dot. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path
        d="M10.5 22.5c-1.6-5.6 1.4-11.4 7.3-13.4 1.6-.5 3.2-.7 4.7-.6-.2 6.5-3.6 12.2-9.3 14.2-.9.3-1.8.3-2.7-.2Z"
        fill="var(--primary-fg)"
        opacity=".95"
      />
      <path d="M11.2 22.3c2.4-3.4 5.2-6.4 8.6-8.9" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="23.2" cy="22.6" r="3.1" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      {showName ? <span className="text-lg">Kadam</span> : null}
    </span>
  );
}
