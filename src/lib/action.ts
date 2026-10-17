import type { z } from "zod";

/** Uniform result returned by Server Actions to client forms. */
export type ActionResult<T = unknown> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

export const initialActionResult: ActionResult = { ok: false };

/** FormData → plain object; repeated keys (multi-selects, tag inputs) become arrays. */
export function formToObject(form: FormData, arrayKeys: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = arrayKeys.includes(key) ? all.map((v) => v.trim()).filter(Boolean) : (all[0] ?? "");
  }
  for (const key of arrayKeys) out[key] ??= [];
  return out;
}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}
