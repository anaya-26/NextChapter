/**
 * Absolute URL on the app's public address (BETTER_AUTH_URL). Behind a forwarding proxy —
 * GitHub Codespaces, a tunnel, some hosts — the request's own URL can say `localhost`,
 * which would send the browser somewhere it can't reach.
 */
export function publicUrl(path: string, requestUrl: string): URL {
  const base = process.env.BETTER_AUTH_URL;
  if (base) {
    try {
      return new URL(path, base);
    } catch {
      // fall through to the request's own URL
    }
  }
  return new URL(path, requestUrl);
}
