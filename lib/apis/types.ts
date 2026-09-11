/**
 * Standard shapes the manga reader works with. Historically these described whatever a given
 * external catalog (MangaDex/Comick/MangaHook) returned before lib/manga-api.ts normalized it —
 * that orchestration layer is gone now that ÍléOtaku serves creator-published content only (see
 * lib/publishedSeries.ts), but the shapes themselves are kept as the one contract the reader,
 * search, browse and explore surfaces all render against.
 */

/** Every manga/manhwa/manhua result on the platform is now creator-published. Kept as a union
 * (rather than replaced with a plain boolean/removed entirely) so call sites that already switch
 * on `source` don't need a second, unrelated refactor on top of this one. */
export type ContentSource = "creator";

export interface MangaListItem {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
  source?: ContentSource;
  /** The work's WorkFormat ("manga"/"manhwa"/"manhua"/"prose") — Browse's All Works tab uses
   * this to route a prose result to /story/[id] instead of loading it into the manga reader. */
  format?: string;
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
  /** That specific chapter's own author-set coin price (0 for a free one). */
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
  /** The publishing account behind this work, so /manga/[id] can link its Creator card to
   * /creator/[handle] and the reader can show the "African Original 🌍" badge. */
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
