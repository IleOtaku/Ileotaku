/**
 * Standard shapes every content source (MangaDex, Comick, MangaHook, and the hardcoded
 * fallback catalog) is transformed into before the orchestrator in lib/manga-api.ts hands it
 * to the rest of the app. Keeping one shared shape here — rather than in manga-api.ts itself —
 * lets each lib/apis/*.ts client import it without a circular dependency on the orchestrator.
 */

export type ContentSource = "mangadex" | "comick" | "mangahook" | "fallback" | "creator";

export interface MangaListItem {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
  /** Which catalog this result came from — powers the source badge on manga cards. */
  source?: ContentSource;
}

export interface MangaListResponse {
  status: string;
  data: {
    mangaList: MangaListItem[];
    metaData?: {
      totalPages?: number;
      currentPage?: number;
    };
  };
}

export interface MangaChapterSummary {
  id: string;
  chapter: string;
  view?: string;
  createdAt?: string;
  /** Set only for source === "creator" chapters — the coin price its author set for this
   * specific chapter (0 for a free one). Ignored for every imported source, which prices by
   * engagement tier instead (see lib/contentLocking.ts's getLockConfig). */
  coinPrice?: number;
}

export interface MangaDetailData {
  id: string;
  title: string;
  image: string;
  description?: string;
  author?: string;
  status?: string;
  genres?: string[];
  chapterList?: MangaChapterSummary[];
  source?: ContentSource;
  /** Set only when source === "creator" — the publishing account behind this ÍléOtaku-native
   * work, so /manga/[id] can link its Creator card to /creator/[handle] and the reader can show
   * the "African Original 🌍" badge. */
  authorId?: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  contentRating?: string;
  format?: string;
  language?: string;
  [key: string]: unknown;
}

export interface MangaDetailResponse {
  status: string;
  data: MangaDetailData;
}

export interface ChapterPagesResponse {
  status: string;
  data: {
    manga_id?: string;
    chapter?: string;
    pages: string[];
    [key: string]: unknown;
  };
}

/** One entry in a client's manga-list response, before it's mapped to MangaListItem. */
export interface MangaApiClient {
  source: ContentSource;
  getMangaList(page?: number, genre?: string): Promise<MangaListItem[]>;
  searchManga(query: string): Promise<MangaListItem[]>;
  getMangaDetail(id: string): Promise<MangaDetailData>;
  getChapterPages(chapterId: string): Promise<string[]>;
}
