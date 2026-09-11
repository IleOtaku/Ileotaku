import { getOptimizedImageUrl } from "./cloudinary";
import type { MangaDetailData } from "./apis/types";
import {
  getCreatorChapterPages,
  getPublishedSeriesDetail,
  listCreatorMangaWorks,
  searchCreatorMangaWorks,
} from "./publishedSeries";

export type {
  ChapterPagesResponse,
  ContentSource,
  MangaChapterSummary,
  MangaDetailData,
  MangaDetailResponse,
  MangaListItem,
  MangaListResponse,
} from "./apis/types";
import type { ChapterPagesResponse, MangaDetailResponse, MangaListResponse } from "./apis/types";

/**
 * Every cover/page image on the platform is now a Cloudinary upload (creator cover art, chapter
 * pages) — this used to also wrap MangaDex/Comick/MangaHook covers in the wsrv.nl proxy (and, for
 * MangaDex specifically, a Cloudflare Worker in front of that) to work around those catalogs
 * blocking datacenter IPs. None of that applies to our own CDN, so this is now a thin pass-through
 * to Cloudinary's own optimizer. `hd` requests Cloudinary's full-quality 1920px delivery instead
 * of the default auto-quality — used by the reader's Platinum HD toggle.
 */
export function proxyImg(url: string, hd = false): string {
  if (!url) return url;
  if (url.includes("res.cloudinary.com")) {
    return hd ? getOptimizedImageUrl(url, 1920, 100) : getOptimizedImageUrl(url);
  }
  return url;
}

/** Manga/manhwa/manhua browse list — every published creator work in that format, newest first
 * (or filtered by genre). Prose works are excluded; they're browsed/read separately via
 * /story/[id] rather than this manga-shaped list+reader pair. */
export async function getMangaList(_page = 1, genre?: string): Promise<MangaListResponse> {
  const items = await listCreatorMangaWorks(genre);
  return { status: "creator", data: { mangaList: items } };
}

export async function searchManga(keyword: string, _page = 1): Promise<MangaListResponse> {
  const items = await searchCreatorMangaWorks(keyword);
  return { status: "creator", data: { mangaList: items } };
}

export async function getMangaDetail(id: string): Promise<MangaDetailResponse> {
  const creatorDetail: MangaDetailData | null = await getPublishedSeriesDetail(id);
  if (!creatorDetail) throw new Error(`No published work found for id "${id}".`);
  return { status: "creator", data: creatorDetail };
}

export async function getChapterPages(chapterId: string): Promise<ChapterPagesResponse> {
  if (chapterId.startsWith("creator:")) {
    const pages = await getCreatorChapterPages(chapterId);
    if (pages) return { status: "creator", data: { pages } };
  }
  throw new Error(`No chapter pages found for id "${chapterId}".`);
}
