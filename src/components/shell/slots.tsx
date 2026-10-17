import Link from "next/link";
import { Bell, Clock3, FlaskConical, ShieldAlert } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { getTestClock, now } from "@/server/clock";
import { aiStatus } from "@/server/ai";
import { formatInTz } from "@/lib/time";
import { UserMenuClient } from "./user-menu-client";

export async function UserMenu() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return <UserMenuClient name={user.name} email={user.email} liteMode={profile.liteMode} />;
}

export async function NotificationBell() {
  const user = await requireUser();
  const current = await now(user.id);
  const unread = await prisma.notification.count({
    where: { userId: user.id, readAt: null, dueAt: { lte: current } },
  });
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative inline-flex size-10 items-center justify-center rounded-[10px] hover:bg-surface-2"
    >
      <Bell className="size-5" aria-hidden />
      {unread ? (
        <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-accent-fg">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

/** Persistent, honest status banners: simulated time, simulated AI, demo data, consent. */
export async function ShellBanners() {
  const user = await requireUser();
  const [profile, clock] = await Promise.all([getProfile(user.id), getTestClock(user.id)]);
  const ai = aiStatus();
  const banners: React.ReactNode[] = [];

  if (clock) {
    banners.push(
      <Banner key="clock" icon={<Clock3 className="size-4" aria-hidden />} tone="info">
        Test clock active — the app thinks it is{" "}
        <strong>{formatInTz(clock.simulatedNow, profile.timezone, { dateStyle: "medium", timeStyle: "short" })}</strong>.{" "}
        <Link href="/settings/developer">Change</Link>
      </Banner>,
    );
  }
  if (ai.simulated) {
    banners.push(
      <Banner key="ai" icon={<FlaskConical className="size-4" aria-hidden />} tone="warning">
        AI responses are <strong>simulated</strong> by a test double (AI_PROVIDER=mock). They are not real AI output.
      </Banner>,
    );
  }
  if (profile.demoDataLoadedAt) {
    banners.push(
      <Banner key="demo" icon={<FlaskConical className="size-4" aria-hidden />} tone="warning">
        This account includes labelled <strong>demonstration history</strong>.{" "}
        <Link href="/settings/developer">Manage demo data</Link>
      </Banner>,
    );
  }
  if (profile.guardianConsent === "PENDING") {
    banners.push(
      <Banner key="consent" icon={<ShieldAlert className="size-4" aria-hidden />} tone="info">
        Because you are under 18, some optional features stay off until a parent or guardian gives consent.{" "}
        <Link href="/settings/privacy">Learn more</Link>
      </Banner>,
    );
  }
  if (!banners.length) return null;
  return <div className="flex flex-col">{banners}</div>;
}

function Banner({ icon, tone, children }: { icon: React.ReactNode; tone: "info" | "warning"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === "warning"
          ? "flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning [&_a]:font-medium [&_a]:underline"
          : "flex items-center gap-2 border-b border-info/25 bg-info-soft px-4 py-2 text-sm text-info [&_a]:font-medium [&_a]:underline"
      }
    >
      {icon}
      <span className="text-fg/85">{children}</span>
    </div>
  );
}
