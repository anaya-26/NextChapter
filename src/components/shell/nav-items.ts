import {
  BookOpen,
  CalendarDays,
  MessageCircleHeart,
  NotebookPen,
  Settings,
  Sprout,
  Sun,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; key: string; icon: LucideIcon; short?: string };

/** The six main spaces, in order. */
export const MAIN_NAV: NavItem[] = [
  { href: "/today", key: "today", icon: Sun },
  { href: "/learn", key: "learn", icon: BookOpen },
  { href: "/journal", key: "journal", icon: NotebookPen },
  { href: "/goals", key: "goals", icon: Target },
  { href: "/community", key: "community", icon: Users },
  { href: "/progress", key: "progress", icon: Sprout },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/companion", key: "companion", icon: MessageCircleHeart },
  { href: "/settings", key: "settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
