import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, FlaskConical, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const toneStyles: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: { box: "bg-info-soft text-info border-info/25", icon: Info },
  success: { box: "bg-success-soft text-success border-success/25", icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning border-warning/30", icon: AlertTriangle },
  danger: { box: "bg-danger-soft text-danger border-danger/25", icon: XCircle },
  neutral: { box: "bg-surface-2 text-muted border-border", icon: Info },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = toneStyles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg/85 [&_a]:underline">{children}</div> : null}
        {action ? <div className="mt-1.5">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center", className)}>
      {Icon ? (
        <div className="rounded-full bg-primary-soft p-3 text-primary-soft-fg">
          <Icon className="size-6" aria-hidden />
        </div>
      ) : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-3", className)} aria-hidden {...props} />;
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Visible label for AI-generated content. `simulated` marks the mock test double. */
export function AiLabel({ simulated, kind = "AI-generated", className }: { simulated?: boolean; kind?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        simulated ? "bg-warning-soft text-warning" : "bg-info-soft text-info",
        className,
      )}
    >
      {simulated ? <FlaskConical className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
      {simulated ? `Simulated AI · ${kind}` : kind}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-dashed border-warning/60 bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning", className)}>
      Demo data
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <div className="text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}
