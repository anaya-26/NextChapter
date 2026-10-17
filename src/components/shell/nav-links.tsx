"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, MessageCircleHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAIN_NAV, SECONDARY_NAV, isActive } from "./nav-items";

export function SidebarNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("mainNavigation")} className="flex flex-1 flex-col gap-1">
      {MAIN_NAV.map((item) => (
        <SideLink key={item.href} href={item.href} icon={item.icon} label={t(item.key)} active={isActive(pathname, item.href)} />
      ))}
      <div className="my-3 h-px bg-border" />
      {SECONDARY_NAV.map((item) => (
        <SideLink key={item.href} href={item.href} icon={item.icon} label={t(item.key)} active={isActive(pathname, item.href)} />
      ))}
    </nav>
  );
}

function SideLink({ href, icon: Icon, label, active }: { href: string; icon: typeof CalendarDays; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium",
        active ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      {label}
    </Link>
  );
}

export function CalendarLink() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <Link
      href="/calendar"
      aria-label={t("openCalendar")}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-medium hover:bg-surface-2",
        isActive(pathname, "/calendar") && "bg-primary-soft text-primary-soft-fg",
      )}
    >
      <CalendarDays className="size-5" aria-hidden />
      <span className="hidden sm:inline">{t("calendar")}</span>
    </Link>
  );
}

/** Companion entry point available on every page (passes the current page as context). */
export function CompanionFab() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  if (isActive(pathname, "/companion")) return null;
  return (
    <Link
      href={`/companion?from=${encodeURIComponent(pathname)}`}
      aria-label={t("openCompanion")}
      className="fixed bottom-20 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-primary-fg shadow-pop hover:bg-primary-hover lg:bottom-6 lg:right-6 print:hidden"
    >
      <MessageCircleHeart className="size-6" aria-hidden />
      <span className="hidden text-sm font-medium sm:inline">{t("companion")}</span>
    </Link>
  );
}

function shortLabel(key: string, label: string) {
  if (key === "goals") return label.split(/\s*[&/]\s*/)[0];
  if (key === "journal" || key === "progress") return label.replace(/^(My|मेरी|माझी)\s+/u, "");
  return label;
}

/** Mobile bottom navigation with all six main spaces. */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("mainNavigation")}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      {MAIN_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10.5px] font-medium leading-tight",
              active ? "text-primary" : "text-muted",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="max-w-full truncate">{shortLabel(item.key, t(item.key))}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-lg bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      {label}
    </a>
  );
}
