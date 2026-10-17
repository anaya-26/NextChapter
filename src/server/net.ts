import "server-only";
import { lookup } from "node:dns/promises";
import { isPublicAddress, unsafeUrlReason } from "@/lib/ip";

/**
 * Fetching URLs that students or feeds supply (link checks, permitted feeds). Every hop is
 * checked: http(s) only, default ports, and the host must resolve only to public addresses,
 * so a link can't be used to probe the server's private network. Redirects are followed
 * manually (re-checked each time) and bodies are size-capped.
 *
 * Residual risk: DNS could change between the check and the connection (rebinding). Deploy
 * behind an egress proxy that blocks private ranges for defence in depth.
 */

export type SafeResponse = { status: number; ok: boolean; url: string; contentType: string | null; body: string | null };
export type SafeFetchOptions = { method?: "GET" | "HEAD"; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; accept?: string };
type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<SafeResponse>;

let override: Fetcher | null = null;

/** Test double for network access. Refused in production. */
export function setSafeFetchOverride(fn: Fetcher | null) {
  if (process.env.NODE_ENV === "production" && fn) throw new Error("Network test doubles are disabled in production");
  override = fn;
}

export class UnsafeUrlError extends Error {}

async function assertPublicHost(url: URL) {
  const reason = unsafeUrlReason(url.toString());
  if (reason) throw new UnsafeUrlError(reason);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return;
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new UnsafeUrlError("This link points to a private network address");
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response larger than ${Math.round(maxBytes / 1024)} KB`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  if (override) return override(rawUrl, opts);
  const { method = "GET", maxBytes = 2 * 1024 * 1024, timeoutMs = 8000, maxRedirects = 3, accept } = opts;
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "KadamLinkCheck/1.0 (+student companion; link checks only)", ...(accept ? { accept } : {}) },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      await res.body?.cancel();
      continue;
    }
    const body = method === "GET" ? await readCapped(res, maxBytes) : (await res.body?.cancel(), null);
    return { status: res.status, ok: res.ok, url: url.toString(), contentType: res.headers.get("content-type"), body };
  }
  throw new Error("Too many redirects");
}

export type LinkCheck = "REACHABLE" | "UNREACHABLE" | "UNCHECKED";

/** Network failures stay "unchecked" rather than claiming a link is dead. */
export async function checkLink(url: string): Promise<LinkCheck> {
  try {
    let res = await safeFetch(url, { method: "HEAD" });
    if (res.status === 405 || res.status === 403 || res.status === 501) res = await safeFetch(url, { method: "GET", maxBytes: 512 * 1024 });
    return res.ok ? "REACHABLE" : res.status === 404 || res.status === 410 ? "UNREACHABLE" : "UNCHECKED";
  } catch (e) {
    return e instanceof UnsafeUrlError ? "UNREACHABLE" : "UNCHECKED";
  }
}
