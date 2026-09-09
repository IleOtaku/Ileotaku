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

async function mdxFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { next: { revalidate: 300 } });
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

async function getMangaList(_page = 1): Promise<MangaListItem[]> {
  const query =
    buildQuery({
      limit: 20,
      contentRating: ["safe", "suggestive"],
      availableTranslatedLanguage: ["en"],
      includes: ["cover_art", "author"],
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
  return res.chapter.data.map((fileName) => `${res.baseUrl}/data/${res.chapter.hash}/${fileName}`);
}

export const mangaDexClient: MangaApiClient = {
  source: "mangadex",
  getMangaList,
  searchManga,
  getMangaDetail,
  getChapterPages,
};
