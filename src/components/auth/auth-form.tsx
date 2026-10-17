"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/feedback";

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

export function AuthForm({ mode, next, googleEnabled }: { mode: "sign-in" | "sign-up"; next?: string; googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const destination = mode === "sign-up" ? "/onboarding" : safeNext(next);

  function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    startTransition(async () => {
      const res =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(mode === "sign-in" ? t("invalid") : (res.error.message ?? "Could not create the account."));
        return;
      }
      router.replace(destination);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{mode === "sign-in" ? t("welcomeBack") : t("startJourney")}</h1>
        <p className="mt-1 text-sm text-muted">{t("privacyNote")}</p>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <form action={onSubmit} className="flex flex-col gap-4">
        {mode === "sign-up" ? (
          <Field label={t("name")} htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required maxLength={80} />
          </Field>
        ) : null}
        <Field label={t("email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("password")} htmlFor="password" hint={mode === "sign-up" ? t("passwordHint") : undefined}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {mode === "sign-in" ? t("signIn") : t("signUp")}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: destination })}
          >
            {t("withGoogle")}
          </Button>
        </>
      ) : null}
      <p className="text-center text-sm text-muted">
        {mode === "sign-in" ? t("noAccount") : t("haveAccount")}{" "}
        <Link className="font-medium text-primary underline-offset-4 hover:underline" href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
          {mode === "sign-in" ? t("signUp") : t("signIn")}
        </Link>
      </p>
    </div>
  );
}
