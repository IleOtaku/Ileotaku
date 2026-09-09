import { comickClient } from "./apis/comick";
import { getOptimizedImageUrl } from "./cloudinary";
import { mangaDexClient } from "./apis/mangadex";
import { mangaHookClient } from "./apis/mangahook";
import type { MangaApiClient, MangaListItem } from "./apis/types";
import {
  FALLBACK_MANGA_LIST,
  filterFallbackByGenre,
  getFallbackChapterPages,
  getFallbackDetail,
  isFallbackId,
  searchFallbackManga,
} from "./fallback-manga";
import { getCreatorChapterPages, getPublishedSeriesDetail } from "./publishedSeries";

export type {
  ChapterPagesResponse,
  ContentSource,
  MangaChapterSummary,
  MangaDetailData,
  MangaDetailResponse,
  MangaListItem,
  MangaListResponse,
} from "./apis/types";
import type { ChapterPagesResponse, MangaDetailData, MangaDetailResponse, MangaListResponse } from "./apis/types";

/** Wraps an image URL in the wsrv.nl proxy so covers/pages load reliably and get resized/cached,
 * regardless of which of the three catalogs (or the fallback data) the URL came from. A
 * Cloudinary url (our own uploaded avatars/cover art/feed images, now that Cloudinary has
 * replaced Firebase Storage — see lib/cloudinary.ts) is routed through Cloudinary's own
 * optimization instead: wsrv.nl exists to make EXTERNAL, uncontrolled image hosts reliable and
 * fast, which doesn't apply to an asset already sitting on a CDN this app controls, and
 * double-proxying would only add latency for no benefit.
 *
 * MangaDex's own `uploads.mangadex.org` cover CDN is confirmed live to reject wsrv.nl's own
 * fetch the same way it once rejected Vercel's — wsrv.nl still answers 200, but with its blank
 * default placeholder instead of the actual cover, since it degrades a failed upstream fetch
 * rather than propagating the error. Fed through our Cloudflare Worker first (same one
 * lib/proxy-fetch.ts already uses for the JSON API calls — a plain server-side fetch, so
 * neither this nor MangaDex's IP block ever come into play for it) and *then* into wsrv.nl,
 * covers resize/cache normally while the actual upstream fetch happens from a path MangaDex
 * doesn't reject.
 *
 * `hd`, when the url turns out to be a Cloudinary one, requests Cloudinary's full-quality
 * 1920px delivery instead of the default auto-quality — used by the reader's Platinum HD
 * toggle. It's a no-op for every url this proxy actually sees today (reader pages are always
 * MangaDex/Comick/MangaHook, never a Cloudinary upload — this app has no chapter-page-upload
 * feature), kept here so HD mode is already correct the day one exists. */
export function proxyImg(url: string, hd = false): string {
  if (!url) return url;
  if (url.includes("res.cloudinary.com")) {
    return hd ? getOptimizedImageUrl(url, 1920, 100) : getOptimizedImageUrl(url);
  }

  const proxyBase = process.env.NEXT_PUBLIC_MANGA_PROXY_URL;
  const upstream =
    proxyBase && url.includes("uploads.mangadex.org")
      ? `${proxyBase}?url=${encodeURIComponent(url)}`
      : url;
  return `https://wsrv.nl/?url=${encodeURIComponent(upstream)}&default=1`;
}

/* ============================== Health tracking ============================== */

export type ApiName = "mangadex" | "comick" | "mangahook";

/** Source priority for active discovery (getMangaList's merge, searchManga's tryAPIs, the
 * admin health check): MangaDex first, then Comick. MangaHook is deliberately left out —
 * confirmed live that mangahook-api.vercel.app has been fully decommissioned (it's now a
 * marketing site; every /api/* route 404s), so retrying it here would only ever waste a
 * request. `clients.mangahook` stays wired below purely for backward compatibility: any
 * "mhk-"-prefixed id already saved in a user's library/history/reading-progress (from before
 * this change) still resolves through detectSource()'s direct getMangaDetail/getChapterPages
 * path — which isn't gated by PRIORITY — and fails gracefully to the fallback catalog exactly
 * like an unreachable source always has, instead of throwing on an id type this app once issued. */
const PRIORITY: ApiName[] = ["mangadex", "comick"];

const clients: Record<ApiName, MangaApiClient> = {
  mangadex: mangaDexClient,
  comick: comickClient,
  mangahook: mangaHookClient,
};

/** How long a source stays marked unhealthy before we automatically give it another chance.
 * Tightened from 5 minutes: now that both active sources go through the Cloudflare proxy
 * (lib/proxy-fetch.ts), a failure is far more likely to be a brief upstream blip than a
 * lasting block, so it's worth checking back sooner rather than serving fallback data for a
 * full 5 minutes after one bad response. */
const UNHEALTHY_RESET_MS = 60 * 1000;

const apiHealth = {
  mangadex: true,
  comick: true,
  mangahook: true,
  lastCheck: {} as Partial<Record<ApiName, number>>,
  lastResponseMs: {} as Partial<Record<ApiName, number>>,
  lastError: {} as Partial<Record<ApiName, string>>,
};

const resetTimers: Partial<Record<ApiName, ReturnType<typeof setTimeout>>> = {};

function markUnhealthy(api: ApiName, error?: unknown): void {
  apiHealth[api] = false;
  apiHealth.lastCheck[api] = Date.now();
  apiHealth.lastError[api] = error instanceof Error ? error.message : String(error ?? "Unknown error");

  const existingTimer = resetTimers[api];
  if (existingTimer) clearTimeout(existingTimer);
  resetTimers[api] = setTimeout(() => {
    apiHealth[api] = true;
  }, UNHEALTHY_RESET_MS);
}

function markHealthy(api: ApiName, responseMs: number): void {
  apiHealth[api] = true;
  apiHealth.lastCheck[api] = Date.now();
  apiHealth.lastResponseMs[api] = responseMs;
  delete apiHealth.lastError[api];

  const existingTimer = resetTimers[api];
  if (existingTimer) {
    clearTimeout(existingTimer);
    delete resetTimers[api];
  }
}

export interface ApiHealthSnapshot {
  name: ApiName;
  healthy: boolean;
  /** "healthy" but the site itself is slow to respond, per the last measured call. */
  degraded: boolean;
  lastCheck: number | null;
  lastResponseMs: number | null;
  lastError: string | null;
}

/** Above this response time a healthy API is reported as "degraded" rather than fully green. */
const SLOW_RESPONSE_MS = 3000;

/** Snapshot of each source's current health, for the admin Technical dashboard. */
export function getAPIHealth(): ApiHealthSnapshot[] {
  return PRIORITY.map((name) => {
    const responseMs = apiHealth.lastResponseMs[name] ?? null;
    return {
      name,
      healthy: apiHealth[name],
      degraded: apiHealth[name] && responseMs !== null && responseMs > SLOW_RESPONSE_MS,
      lastCheck: apiHealth.lastCheck[name] ?? null,
      lastResponseMs: responseMs,
      lastError: apiHealth.lastError[name] ?? null,
    };
  });
}

/** Manually pings every source (bypassing the "skip if unhealthy" shortcut) and returns the
 * refreshed health snapshot — powers the admin dashboard's "Check All APIs" button. */
export async function checkAllAPIs(): Promise<ApiHealthSnapshot[]> {
  await Promise.all(
    PRIORITY.map(async (name) => {
      const started = Date.now();
      try {
        await clients[name].getMangaList(1);
        markHealthy(name, Date.now() - started);
      } catch (err) {
        markUnhealthy(name, err);
      }
    })
  );
  return getAPIHealth();
}

/** Tries each currently-healthy source in priority order, returning the first success along
 * with which source produced it. Used for single-result flows (search, detail, pages) where
 * we want *a* good answer fast rather than combining every source's answer. */
async function tryAPIs<T>(
  fn: (client: MangaApiClient) => Promise<T>
): Promise<{ result: T; source: ApiName } | null> {
  for (const name of PRIORITY) {
    if (!apiHealth[name]) continue;
    const started = Date.now();
    try {
      const result = await fn(clients[name]);
      markHealthy(name, Date.now() - started);
      return { result, source: name };
    } catch (err) {
      markUnhealthy(name, err);
    }
  }
  return null;
}

/* ============================== Merge / dedupe ============================== */

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Folds near-duplicate titles from different sources into one entry (keeping the
 * higher-priority source's copy) — a normalized-match-or-containment check rather than a
 * full edit-distance comparison, which is enough to catch the common case of the same title
 * appearing across MangaDex/Comick/MangaHook with only punctuation or subtitle differences. */
function dedupeByTitleSimilarity(items: MangaListItem[]): MangaListItem[] {
  const kept: MangaListItem[] = [];
  const keys: string[] = [];
  for (const item of items) {
    const norm = normalizeTitle(item.title);
    if (!norm) continue;
    const isDuplicate = keys.some((k) => k === norm || (k.length > 4 && norm.includes(k)) || (norm.length > 4 && k.includes(norm)));
    if (isDuplicate) continue;
    keys.push(norm);
    kept.push(item);
  }
  return kept;
}

function fallbackList(genre?: string): MangaListResponse {
  const list = genre && genre.toLowerCase() !== "all" ? filterFallbackByGenre(genre) : FALLBACK_MANGA_LIST;
  return { status: "fallback", data: { mangaList: list } };
}

/* ============================== Public API ============================== */

/** Live manga list, merged across every healthy source and deduplicated by title, falling
 * back to the hardcoded catalog if all three sources are unreachable. */
export async function getMangaList(page = 1, genre?: string): Promise<MangaListResponse> {
  const order = PRIORITY.filter((name) => apiHealth[name]);
  if (order.length === 0) return fallbackList(genre);

  const settled = await Promise.allSettled(
    order.map(async (name) => {
      const started = Date.now();
      const items = await clients[name].getMangaList(page, genre);
      markHealthy(name, Date.now() - started);
      return items;
    })
  );

  const merged: MangaListItem[] = [];
  settled.forEach((res, i) => {
    const name = order[i];
    if (res.status === "fulfilled") {
      merged.push(...res.value);
    } else {
      markUnhealthy(name, res.reason);
    }
  });

  if (merged.length === 0) return fallbackList(genre);
  return { status: "orchestrated", data: { mangaList: dedupeByTitleSimilarity(merged) } };
}

export async function searchManga(keyword: string, _page = 1): Promise<MangaListResponse> {
  const attempt = await tryAPIs((client) => client.searchManga(keyword));
  if (attempt) return { status: attempt.source, data: { mangaList: attempt.result } };
  return { status: "fallback", data: { mangaList: searchFallbackManga(keyword) } };
}

function detectSource(id: string): ApiName | "fallback" | "creator" | null {
  if (id.startsWith("mdx-")) return "mangadex";
  if (id.startsWith("cmk-")) return "comick";
  if (id.startsWith("mhk-")) return "mangahook";
  if (id.startsWith("creator:")) return "creator";
  if (isFallbackId(id)) return "fallback";
  return null;
}

function fallbackDetailResponse(id: string): MangaDetailResponse {
  const detail: MangaDetailData | null = getFallbackDetail(id) ?? getFallbackDetail(FALLBACK_MANGA_LIST[0].id);
  return { status: "fallback", data: { ...(detail as MangaDetailData), source: "fallback" } };
}

export async function getMangaDetail(id: string): Promise<MangaDetailResponse> {
  const source = detectSource(id);

  // No recognized external-catalog prefix and not a known fallback demo id — before assuming
  // this is unknown and silently rendering the wrong (first fallback) series, check whether it's
  // an ÍléOtaku creator-published work id (see lib/publishedSeries.ts's ID-prefix convention).
  if (source === null) {
    const creatorDetail = await getPublishedSeriesDetail(id);
    if (creatorDetail) return { status: "creator", data: creatorDetail };
    return fallbackDetailResponse(id);
  }
  // "creator:"-prefixed ids only ever occur on chapter ids (see getChapterPages below), never on
  // a bare manga/work id — this branch is unreachable in practice, but narrows `source` back to
  // ApiName for the `clients[source]` lookup below.
  if (source === "fallback" || source === "creator") return fallbackDetailResponse(id);

  const started = Date.now();
  try {
    const data = await clients[source].getMangaDetail(id);
    markHealthy(source, Date.now() - started);
    return { status: source, data };
  } catch (err) {
    markUnhealthy(source, err);
    return fallbackDetailResponse(id);
  }
}

export async function getChapterPages(chapterId: string): Promise<ChapterPagesResponse> {
  if (chapterId.startsWith("creator:")) {
    const pages = await getCreatorChapterPages(chapterId);
    if (pages) return { status: "creator", data: { pages } };
  }

  const fallbackPages = getFallbackChapterPages(chapterId);
  if (fallbackPages) {
    return { status: "fallback", data: { pages: fallbackPages } };
  }

  const source = detectSource(chapterId);
  if (source && source !== "fallback" && source !== "creator") {
    const started = Date.now();
    try {
      const pages = await clients[source].getChapterPages(chapterId);
      markHealthy(source, Date.now() - started);
      return { status: source, data: { pages } };
    } catch (err) {
      markUnhealthy(source, err);
    }
  }

  const pages = getFallbackChapterPages(`${FALLBACK_MANGA_LIST[0].id}-ch-1`) ?? [];
  return { status: "fallback", data: { pages } };
}
