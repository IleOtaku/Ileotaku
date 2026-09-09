import type { MangaApiClient, MangaChapterSummary, MangaDetailData, MangaListItem } from "./types";

const BASE_URL = "https://api.comick.io";
const IMAGE_BASE = "https://meo.comick.pictures";

/** Comick addresses a title by its "slug" (search/list results, human-readable) but its
 * chapters endpoint needs the "hid" (short internal id) instead — both get folded into a
 * single app-facing id as `cmk-{slug}` and resolved back to slug/hid inside this client, so
 * every other id-based call in the app (getMangaDetail, links, Firestore keys) only ever
 * has to carry one opaque string, the same as every other source. */
const PREFIX = "cmk-";

function toComickSlug(id: string): string {
  return id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
}

function fromComickSlug(slug: string): string {
  return `${PREFIX}${slug}`;
}

/** Chapter ids are prefixed the same way, carrying Comick's chapter "hid". */
function toComickChapterHid(chapterId: string): string {
  return chapterId.startsWith(PREFIX) ? chapterId.slice(PREFIX.length) : chapterId;
}

function fromComickChapterHid(hid: string): string {
  return `${PREFIX}${hid}`;
}

// See lib/apis/mangadex.ts's API_HEADERS comment — same rationale, same caveat (User-Agent and
// Referer only actually take effect for the one remaining server-side caller; the browser
// controls both of those on every client-side fetch and silently ignores whatever's set here).
const API_HEADERS = {
  "User-Agent": "ÍléOtaku/1.0 (https://ileotaku.vercel.app)",
  Accept: "application/json",
  Referer: "https://ileotaku.vercel.app",
};

async function cmkFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: API_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Comick API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

interface CmkCover {
  b2key?: string;
}

interface CmkSearchItem {
  hid: string;
  slug: string;
  title: string;
  md_covers?: CmkCover[];
  last_chapter?: number | string;
}

interface CmkComicDetail {
  id?: number;
  hid: string;
  slug: string;
  title: string;
  desc?: string;
  status?: number;
  md_covers?: CmkCover[];
}

interface CmkComicDetailResponse {
  comic: CmkComicDetail;
  authors?: { name: string }[];
  genres?: { name: string }[];
}

interface CmkChapterListItem {
  hid: string;
  chap?: string | null;
  title?: string | null;
  created_at?: string;
}

interface CmkChapterListResponse {
  chapters: CmkChapterListItem[];
}

interface CmkChapterImage {
  b2key?: string;
  url?: string;
}

interface CmkChapterPagesResponse {
  chapter: {
    images?: CmkChapterImage[];
    md_images?: CmkChapterImage[];
  };
}

const STATUS_LABELS: Record<number, string> = { 1: "Ongoing", 2: "Completed", 3: "Cancelled", 4: "Hiatus" };

function coverUrl(covers: CmkCover[] | undefined): string {
  const key = covers?.[0]?.b2key;
  return key ? `${IMAGE_BASE}/${key}` : "";
}

function searchItemToListItem(item: CmkSearchItem): MangaListItem {
  return {
    id: fromComickSlug(item.slug),
    title: item.title,
    image: coverUrl(item.md_covers),
    chapter: item.last_chapter ? `Chapter ${item.last_chapter}` : undefined,
    source: "comick",
  };
}

async function getMangaList(): Promise<MangaListItem[]> {
  const res = await cmkFetch<CmkSearchItem[]>("/v1.0/search?limit=20&page=1&sort=view&type=ongoing");
  return (Array.isArray(res) ? res : []).map(searchItemToListItem);
}

async function searchManga(query: string): Promise<MangaListItem[]> {
  const res = await cmkFetch<CmkSearchItem[]>(`/v1.0/search?q=${encodeURIComponent(query)}&limit=20`);
  return (Array.isArray(res) ? res : []).map(searchItemToListItem);
}

function chapterToSummary(c: CmkChapterListItem): MangaChapterSummary {
  return {
    id: fromComickChapterHid(c.hid),
    chapter: c.chap ? `Chapter ${c.chap}` : c.title || "Chapter",
    createdAt: c.created_at,
  };
}

async function getMangaDetail(id: string): Promise<MangaDetailData> {
  const slug = toComickSlug(id);
  const detailRes = await cmkFetch<CmkComicDetailResponse>(`/comic/${slug}`);
  const c = detailRes.comic;

  let chapterList: MangaChapterSummary[] = [];
  try {
    const chapterRes = await cmkFetch<CmkChapterListResponse>(
      `/comic/${c.hid}/chapters?lang=en&limit=100&page=1`
    );
    chapterList = (chapterRes.chapters ?? []).map(chapterToSummary);
  } catch {
    chapterList = [];
  }

  return {
    id: fromComickSlug(c.slug),
    title: c.title,
    image: coverUrl(c.md_covers),
    description: c.desc,
    author: detailRes.authors?.map((a) => a.name).join(", "),
    status: c.status !== undefined ? STATUS_LABELS[c.status] ?? "Ongoing" : undefined,
    genres: detailRes.genres?.map((g) => g.name) ?? [],
    chapterList,
    source: "comick",
  };
}

async function getChapterPages(chapterId: string): Promise<string[]> {
  const hid = toComickChapterHid(chapterId);
  const res = await cmkFetch<CmkChapterPagesResponse>(`/chapter/${hid}`);
  const images = res.chapter.images ?? res.chapter.md_images ?? [];
  return images
    .map((img) => img.url ?? (img.b2key ? `${IMAGE_BASE}/${img.b2key}` : ""))
    .filter((url) => url.length > 0);
}

export const comickClient: MangaApiClient = {
  source: "comick",
  getMangaList,
  searchManga,
  getMangaDetail,
  getChapterPages,
};
