import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./locales";
import en from "../messages/en.json";

type Messages = Record<string, unknown>;

/** Overlay a partial translation on top of English so untranslated keys fall back gracefully. */
function overlay(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const b = base[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object"
        ? overlay(b as Messages, v as Messages)
        : v;
  }
  return out;
}

export default getRequestConfig(async () => {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  let messages: Messages = en;
  if (locale !== "en") {
    const partial = (await import(`../messages/${locale}.json`)).default as Messages;
    messages = overlay(en, partial);
  }
  return { locale, messages, timeZone: "Asia/Kolkata" };
});
