/**
 * Routes MangaDex/Comick calls through a same-purpose Cloudflare Worker (its URL in
 * NEXT_PUBLIC_MANGA_PROXY_URL) instead of hitting those APIs directly.
 *
 * Two separate problems this fixes, neither solvable from inside this app alone:
 * - Server-side (Vercel serverless): MangaDex/Comick block requests from known cloud-provider
 *   IP ranges, Vercel's included — confirmed live as the original "works locally, 503s in
 *   production" bug.
 * - Client-side (the browser, where lib/manga-api.ts's calls were moved to escape the IP
 *   block above): confirmed live that MangaDex/Comick don't send CORS headers permitting
 *   cross-origin fetch() from an arbitrary site, so the browser rejects the response outright
 *   with "Failed to fetch" — a different failure mode, same net result (no data).
 *
 * The Worker runs on Cloudflare's network (not Vercel's, so not IP-blocked) and, being a
 * server making the request rather than a browser, is never subject to CORS in the first
 * place — so it resolves both failure modes at once regardless of which side of the app calls
 * it. When NEXT_PUBLIC_MANGA_PROXY_URL isn't set (local dev without the Worker configured),
 * falls back to calling the API directly with the identifying headers MangaDex/Comick ask
 * API consumers to send — browsers still silently strip User-Agent from a same-origin-policy
 * fetch() call, so that fallback only fully applies server-side, same caveat as before.
 */
export async function proxyFetch(url: string): Promise<Response> {
  const proxyBase = process.env.NEXT_PUBLIC_MANGA_PROXY_URL;
  if (proxyBase) {
    return fetch(`${proxyBase}?url=${encodeURIComponent(url)}`);
  }
  return fetch(url, {
    headers: {
      "User-Agent": "IleOtaku/1.0 (https://ileotaku.vercel.app)",
      Accept: "application/json",
    },
  });
}
