import type { MangaApiClient, MangaChapterSummary, MangaDetailData, MangaListItem } from "./types";

const BASE_URL = "https://mangahook-api.vercel.app/api";

/** Same routing convention as the other two clients — every id/chapter-id this client hands
 * out gets an "mhk-" prefix so the orchestrator can tell at a glance which client to route a
 * getMangaDetail/getChapterPages call back to. */
const PREFIX = "mhk-";

function toMangaHookId(id: string): string {
  const stripped = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
  // MangaHook's own list ids carry a leading "1" that its detail/chapter endpoints don't
  // expect — a quirk of their API, unrelated to our prefixing.
  return stripped.startsWith("1") ? stripped.slice(1) : stripped;
}

function fromMangaHookId(id: string): string {
  return `${PREFIX}${id}`;
}

// See lib/apis/mangadex.ts's API_HEADERS comment for the same rationale/caveat.
const API_HEADERS = {
  "User-Agent": "ÍléOtaku/1.0 (https://ileotaku.vercel.app)",
  Accept: "application/json",
  Referer: "https://ileotaku.vercel.app",
};

async function mhkFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: API_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`MangaHook API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

interface MhkListItem {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
}

interface MhkListResponse {
  data: { mangaList: MhkListItem[] };
}

interface MhkChapterSummary {
  id: string;
  chapter: string;
  view?: string;
  createdAt?: string;
}

interface MhkDetailResponse {
  data: {
    id?: string;
    title: string;
    image: string;
    description?: string;
    author?: string;
    status?: string;
    genres?: string[];
    chapterList?: MhkChapterSummary[];
  };
}

interface MhkChapterPagesResponse {
  data: { pages: string[] };
}

function listItemToMangaListItem(item: MhkListItem): MangaListItem {
  return {
    id: fromMangaHookId(item.id),
    title: item.title,
    image: item.image,
    chapter: item.chapter,
    view: item.view,
    source: "mangahook",
  };
}

function chapterToSummary(c: MhkChapterSummary): MangaChapterSummary {
  return {
    id: fromMangaHookId(c.id),
    chapter: c.chapter,
    view: c.view,
    createdAt: c.createdAt,
  };
}

async function getMangaList(page = 1, genre?: string): Promise<MangaListItem[]> {
  const query = genre ? `?page=${page}&category=${encodeURIComponent(genre)}` : `?page=${page}`;
  const res = await mhkFetch<MhkListResponse>(`/mangaList${query}`);
  return res.data.mangaList.map(listItemToMangaListItem);
}

async function searchManga(query: string): Promise<MangaListItem[]> {
  const res = await mhkFetch<MhkListResponse>(`/search/${encodeURIComponent(query)}?page=1`);
  return res.data.mangaList.map(listItemToMangaListItem);
}

async function getMangaDetail(id: string): Promise<MangaDetailData> {
  const rawId = toMangaHookId(id);
  const res = await mhkFetch<MhkDetailResponse>(`/manga/${rawId}`);
  const d = res.data;
  return {
    id: fromMangaHookId(d.id ?? rawId),
    title: d.title,
    image: d.image,
    description: d.description,
    author: d.author,
    status: d.status,
    genres: d.genres ?? [],
    chapterList: (d.chapterList ?? []).map(chapterToSummary),
    source: "mangahook",
  };
}

async function getChapterPages(chapterId: string): Promise<string[]> {
  const rawId = toMangaHookId(chapterId);
  const res = await mhkFetch<MhkChapterPagesResponse>(`/chapter/${rawId}`);
  return res.data.pages ?? [];
}

export const mangaHookClient: MangaApiClient = {
  source: "mangahook",
  getMangaList,
  searchManga,
  getMangaDetail,
  getChapterPages,
};
