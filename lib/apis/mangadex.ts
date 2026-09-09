import { proxyFetch } from "../proxy-fetch";
import type { MangaApiClient, MangaChapterSummary, MangaDetailData, MangaListItem } from "./types";

const BASE_URL = "https://api.mangadex.org";
const COVER_BASE = "https://uploads.mangadex.org/covers";

/** All our manga ids get a source prefix so the orchestrator can route a bare id (e.g. from
 * getChapterPages) back to the right client without guessing. MangaDex itself uses UUIDs. */
const PREFIX = "mdx-";

export function toMangaDexId(id: string): string {
  return id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
}

function fromMangaDexId(id: string): string {
  return `${PREFIX}${id}`;
}

/** MangaDex tags a manga with its own genre-tag UUIDs, not plain names like Comick/MangaHook
 * take — so the genre chips in components/reader/MangaList.tsx (READER_GENRES) need mapping to
 * these before they mean anything as an `includedTags[]` filter. Kept here rather than in
 * lib/manga-api.ts (the orchestrator) since it's purely this client's own translation of its
 * own upstream API, and lib/manga-api.ts already imports FROM this file — a mapping used only
 * here living there instead would just be an import cycle for no benefit. Keyed by the exact
 * chip label text ("Sci-fi", not "Sci-Fi") so a lookup by `genre` never silently misses.
 * "Manhwa" has no entry: it's a MangaDex *format* tag, not a genre one, and guessing at an id
 * would risk quietly filtering to the wrong (or an empty) set rather than just not filtering —
 * selecting it currently falls through to unfiltered, same as before this mapping existed. */
const MANGADEX_GENRE_MAP: Record<string, string> = {
  Action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  Romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  Fantasy: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  Drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  Adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  Horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  Comedy: "4d32cc48-9f00-4cca-9b5a-a56702952f17",
  "Sci-fi": "256c8bd9-4904-4360-bf4f-508a76d67183",
};

/** Builds a query string, repeating the key for array values (MangaDex's `field[]=a&field[]=b`
 * convention) rather than comma-joining them. */
function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

// Every call goes through proxyFetch (lib/proxy-fetch.ts) — a Cloudflare Worker that both
// escapes MangaDex's IP block on server-side calls and sidesteps the CORS rejection MangaDex
// gives client-side calls, confirmed live as the actual cause of "MangaDex loads locally but
// not in production" surviving the earlier move-fetch-to-the-client fix.
async function mdxFetch<T>(path: string): Promise<T> {
  const res = await proxyFetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`MangaDex API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

interface MdxTitleMap {
  en?: string;
  [locale: string]: string | undefined;
}

interface MdxRelationship {
  id: string;
  type: string;
  attributes?: { fileName?: string; name?: string };
}

interface MdxMangaAttributes {
  title: MdxTitleMap;
  description?: MdxTitleMap;
  status?: string;
  tags?: { attributes?: { name?: MdxTitleMap } }[];
}

interface MdxManga {
  id: string;
  attributes: MdxMangaAttributes;
  relationships?: MdxRelationship[];
}

interface MdxMangaListResponse {
  data: MdxManga[];
}

interface MdxChapterAttributes {
  chapter: string | null;
  title: string | null;
  publishAt?: string;
  pages?: number;
}

interface MdxChapter {
  id: string;
  attributes: MdxChapterAttributes;
}

interface MdxChapterListResponse {
  data: MdxChapter[];
}

interface MdxAtHomeResponse {
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}

function pickLocale(map: MdxTitleMap | undefined): string {
  if (!map) return "";
  return map.en ?? Object.values(map).find((v) => !!v) ?? "";
}

function coverFileName(m: MdxManga): string | undefined {
  return m.relationships?.find((r) => r.type === "cover_art")?.attributes?.fileName;
}

function authorName(m: MdxManga): string | undefined {
  return m.relationships?.find((r) => r.type === "author")?.attributes?.name;
}

export function mangaDexCoverUrl(mangaId: string, fileName: string): string {
  return `${COVER_BASE}/${toMangaDexId(mangaId)}/${fileName}.256.jpg`;
}

function toListItem(m: MdxManga): MangaListItem {
  const fileName = coverFileName(m);
  return {
    id: fromMangaDexId(m.id),
    title: pickLocale(m.attributes.title) || "Untitled",
    image: fileName ? mangaDexCoverUrl(m.id, fileName) : "",
    source: "mangadex",
  };
}

function chapterToSummary(c: MdxChapter): MangaChapterSummary {
  return {
    id: fromMangaDexId(c.id),
    chapter: c.attributes.chapter ? `Chapter ${c.attributes.chapter}` : c.attributes.title || "Chapter",
    createdAt: c.attributes.publishAt,
  };
}

async function getMangaList(_page = 1, genre?: string): Promise<MangaListItem[]> {
  const genreId = genre ? MANGADEX_GENRE_MAP[genre] : undefined;
  const query =
    buildQuery({
      limit: 20,
      contentRating: ["safe", "suggestive"],
      availableTranslatedLanguage: ["en"],
      includes: ["cover_art", "author"],
      includedTags: genreId ? [genreId] : undefined,
    }) + "&order[latestUploadedChapter]=desc";

  const res = await mdxFetch<MdxMangaListResponse>(`/manga?${query}`);
  return res.data.map(toListItem);
}

async function searchManga(term: string): Promise<MangaListItem[]> {
  const query = buildQuery({
    limit: 20,
    title: term,
    contentRating: ["safe", "suggestive"],
    availableTranslatedLanguage: ["en"],
    includes: ["cover_art", "author"],
  });
  const res = await mdxFetch<MdxMangaListResponse>(`/manga?${query}`);
  return res.data.map(toListItem);
}

async function getMangaDetail(id: string): Promise<MangaDetailData> {
  const rawId = toMangaDexId(id);
  const query = buildQuery({ includes: ["cover_art", "author", "artist"] });
  const detailRes = await mdxFetch<{ data: MdxManga }>(`/manga/${rawId}?${query}`);
  const m = detailRes.data;

  const chapterQuery = buildQuery({
    manga: rawId,
    translatedLanguage: ["en"],
    limit: 100,
  });
  let chapterList: MangaChapterSummary[] = [];
  try {
    const chapterRes = await mdxFetch<MdxChapterListResponse>(
      `/chapter?${chapterQuery}&order[chapter]=asc`
    );
    chapterList = chapterRes.data.map(chapterToSummary).reverse(); // newest-first, matching app convention
  } catch {
    chapterList = [];
  }

  const fileName = coverFileName(m);
  const genres = (m.attributes.tags ?? [])
    .map((t) => pickLocale(t.attributes?.name))
    .filter((g): g is string => !!g);

  return {
    id: fromMangaDexId(m.id),
    title: pickLocale(m.attributes.title) || "Untitled",
    image: fileName ? mangaDexCoverUrl(m.id, fileName) : "",
    description: pickLocale(m.attributes.description),
    author: authorName(m),
    status: m.attributes.status,
    genres,
    chapterList,
    source: "mangadex",
  };
}

async function getChapterPages(chapterId: string): Promise<string[]> {
  const rawId = toMangaDexId(chapterId);
  const res = await mdxFetch<MdxAtHomeResponse>(`/at-home/server/${rawId}`);
  const pageUrls = res.chapter.data.map((fileName) => `${res.baseUrl}/data/${res.chapter.hash}/${fileName}`);

  // Same at-home data host as the cover CDN, same rejection of a non-Worker fetcher — proxy
  // every page through the Cloudflare Worker (lib/proxy-fetch.ts's NEXT_PUBLIC_MANGA_PROXY_URL)
  // so the reader's <img> tags resolve instead of silently failing to load. Unlike proxyImg's
  // cover path, pages aren't also run through wsrv.nl — at-home page urls are already
  // one-time-use/session-scoped, and wsrv.nl's own resize/cache would just add latency for a
  // full-resolution image the reader wants to display close to as-is.
  const proxyBase = process.env.NEXT_PUBLIC_MANGA_PROXY_URL;
  if (!proxyBase) return pageUrls;
  return pageUrls.map((pageUrl) => `${proxyBase}?url=${encodeURIComponent(pageUrl)}`);
}

export const mangaDexClient: MangaApiClient = {
  source: "mangadex",
  getMangaList,
  searchManga,
  getMangaDetail,
  getChapterPages,
};
