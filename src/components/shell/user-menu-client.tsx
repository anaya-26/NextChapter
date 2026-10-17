"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Brain, Feather, LogOut, Monitor, Moon, PlugZap, Shield, Sun, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    localStorage.removeItem("kadam-theme");
  } else {
    root.dataset.theme = theme;
    localStorage.setItem("kadam-theme", theme);
  }
}

export function UserMenuClient({ name, email, liteMode }: { name: string; email: string; liteMode: boolean }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lite, setLite] = useState(liteMode);

  // Keep the pre-paint flag in sync with the saved profile preference.
  useEffect(() => {
    try {
      localStorage.setItem("kadam-lite", String(lite));
      if (lite) document.documentElement.dataset.lite = "true";
      else delete document.documentElement.dataset.lite;
    } catch {}
  }, [lite]);

  async function toggleLite() {
    const nextValue = !lite;
    setLite(nextValue);
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liteMode: nextValue }),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account")}
        className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-fg hover:brightness-95"
      >
        {initials(name || email) || "?"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-semibold text-fg">{name}</span>
          <span className="block truncate">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserRound /> {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/memory">
            <Brain /> {t("memory")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/privacy">
            <Shield /> {t("privacy")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/integrations">
            <PlugZap /> {t("integrations")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {(
            [
              ["light", Sun, t("themeLight")],
              ["dark", Moon, t("themeDark")],
              ["system", Monitor, t("themeSystem")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyTheme(value)}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void toggleLite();
          }}
        >
          <Feather /> {t("lite")}
          <span className="ml-auto text-xs text-muted">{lite ? "On" : "Off"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              await authClient.signOut();
              router.replace("/sign-in");
              router.refresh();
            })
          }
        >
          <LogOut /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
