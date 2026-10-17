import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/shell/logo";
import { BottomNav, CalendarLink, CompanionFab, SidebarNav, SkipLink } from "@/components/shell/nav-links";
import { OfflineNotice } from "@/components/shell/offline-notice";
import { NotificationBell, ShellBanners, UserMenu } from "@/components/shell/slots";

/**
 * The frame renders immediately; request-time pieces (user menu, banners, notification
 * count) stream into their own Suspense boundaries so navigation never waits on them.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("app");
  return (
    <div className="flex min-h-dvh">
      <SkipLink label={t("skipToContent")} />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 lg:flex print:hidden">
        <Link href="/today" className="mb-6 px-2" aria-label="NextChapter — Today">
          <Logo />
        </Link>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur sm:px-5 print:hidden">
          <Link href="/today" className="lg:hidden" aria-label="NextChapter — Today">
            <Logo showName={false} />
          </Link>
          <div className="flex-1" />
          <CalendarLink />
          <Suspense fallback={<span className="size-10" />}>
            <NotificationBell />
          </Suspense>
          <Suspense fallback={<span className="size-10 animate-pulse rounded-full bg-surface-3" />}>
            <UserMenu />
          </Suspense>
        </header>

        <div className="print:hidden">
          <Suspense fallback={null}>
            <ShellBanners />
          </Suspense>
          <OfflineNotice />
        </div>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <CompanionFab />
      <BottomNav />
    </div>
  );
}
