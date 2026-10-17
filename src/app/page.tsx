import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpenCheck, CalendarHeart, Map, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { buttonVariants } from "@/components/ui/button";

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const features = [
    { icon: Map, title: t("f1Title"), body: t("f1Body") },
    { icon: BookOpenCheck, title: t("f2Title"), body: t("f2Body") },
    { icon: CalendarHeart, title: t("f3Title"), body: t("f3Body") },
  ];
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("signIn")}
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
        <section className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-fg">
            {t("for")}
          </p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">{t("headline")}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">{t("sub")}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              {t("cta")}
            </Link>
            <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "lg" })}>
              {t("signIn")}
            </Link>
          </div>
        </section>
        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card">
              <div className="mb-3 inline-flex rounded-xl bg-primary-soft p-2.5 text-primary-soft-fg">
                <Icon className="size-5" aria-hidden />
              </div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </section>
        <p className="mt-10 flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Private by default: your journal, notes and uploads are visible only to you.
        </p>
      </main>
    </div>
  );
}
