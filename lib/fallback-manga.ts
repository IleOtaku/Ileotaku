/**
 * Twelve hardcoded titles, spanning action, romance, fantasy, drama, manhwa and manhua,
 * shown whenever all three live content sources (MangaDex, Comick, MangaHook) are
 * unreachable — the orchestrator in lib/manga-api.ts falls back to this data as a last
 * resort so the reader always has something to show instead of an empty/broken screen.
 */

export interface FallbackListItem {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
}

export interface FallbackChapterSummary {
  id: string;
  chapter: string;
  view?: string;
  createdAt?: string;
}

export interface FallbackDetail {
  id: string;
  title: string;
  image: string;
  description: string;
  author: string;
  status: string;
  genres: string[];
  chapterList: FallbackChapterSummary[];
  [key: string]: unknown;
}

interface FallbackTitle {
  id: string;
  title: string;
  author: string;
  genres: string[];
  status: string;
  chapters: number;
  views: string;
  synopsis: string;
  accent: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const FALLBACK_TITLES: FallbackTitle[] = [
  {
    id: "fallback-1",
    title: "Kobo's Ascent",
    author: "A. Adeyemi",
    genres: ["Action", "Fantasy", "Adventure"],
    status: "Ongoing",
    chapters: 8,
    views: "812K",
    synopsis:
      "A street courier in a sky-forged city discovers his blood carries the old sun-fire, and every rooftop chase now draws hunters who want it for themselves.",
    accent: "c4622d",
  },
  {
    id: "fallback-2",
    title: "Zuri & the Ember Court",
    author: "N. Mensah",
    genres: ["Fantasy", "Drama", "Romance"],
    status: "Ongoing",
    chapters: 6,
    views: "634K",
    synopsis:
      "Exiled from the Ember Court for a crime she didn't commit, Zuri returns years later as the only person who can stop the coronation of a king who did.",
    accent: "3d6b4f",
  },
  {
    id: "fallback-3",
    title: "Ọba's Shadow",
    author: "T. Okoye",
    genres: ["Action", "Horror", "Drama"],
    status: "Ongoing",
    chapters: 10,
    views: "957K",
    synopsis:
      "Every king in the lineage has a shadow that outlives them. When the shadow wakes up early, the current Ọba has to find out why before it finds him first.",
    accent: "d4a843",
  },
  {
    id: "fallback-4",
    title: "Nairobi Nights",
    author: "W. Kamau",
    genres: ["Sci-fi", "Drama", "Adventure"],
    status: "Ongoing",
    chapters: 7,
    views: "421K",
    synopsis:
      "In a city that never turns its neon off, a courier drone pilot stumbles onto a signal that shouldn't exist — and a corporation that will kill to keep it that way.",
    accent: "9ecfef",
  },
  {
    id: "fallback-5",
    title: "Sahara Drift",
    author: "L. Haile",
    genres: ["Adventure", "Romance", "Comedy"],
    status: "Completed",
    chapters: 12,
    views: "1.2M",
    synopsis:
      "Two rival dune-racers, one broken-down sand-skiff, and a thousand miles of desert between them and the only mechanic who can get them both home.",
    accent: "e07840",
  },
  {
    id: "fallback-6",
    title: "Lagos Lightbringer",
    author: "K. Eze",
    genres: ["Action", "Manhwa", "Comedy"],
    status: "Ongoing",
    chapters: 9,
    views: "588K",
    synopsis:
      "A blackout across the city hands a bus conductor powers he never asked for — and a growing list of people who'd rather he never asked at all.",
    accent: "4e8a64",
  },
  {
    id: "fallback-7",
    title: "Windrunner's Vow",
    author: "P. Nkemelu",
    genres: ["Manhua", "Adventure", "Fantasy"],
    status: "Ongoing",
    chapters: 11,
    views: "349K",
    synopsis:
      "Sworn to carry a dying wind-spirit's last message across three warring provinces, a disgraced courier learns the message is really about her.",
    accent: "c98a3e",
  },
  {
    id: "fallback-8",
    title: "Cairo Cipher",
    author: "R. Aboud",
    genres: ["Drama", "Mystery", "Thriller"],
    status: "Ongoing",
    chapters: 5,
    views: "276K",
    synopsis:
      "A museum archivist finds her late father's handwriting inside a manuscript sealed a century before he was born, and starts pulling at a thread the whole city wants left alone.",
    accent: "7d6b9e",
  },
  {
    id: "fallback-9",
    title: "Bridewealth",
    author: "F. Adeyinka",
    genres: ["Romance", "Drama", "Slice of Life"],
    status: "Completed",
    chapters: 14,
    views: "902K",
    synopsis:
      "An arranged match neither family expects to last becomes the one thing both families can't imagine undoing, one stubborn, funny, hard-won year at a time.",
    accent: "d46a86",
  },
  {
    id: "fallback-10",
    title: "Iron Griot",
    author: "S. Boateng",
    genres: ["Action", "Manhwa", "Sci-fi"],
    status: "Ongoing",
    chapters: 8,
    views: "513K",
    synopsis:
      "The last analog storyteller in a fully-networked city discovers the uplink towers are erasing more than static — they're erasing history, one retelling at a time.",
    accent: "5b8ba6",
  },
  {
    id: "fallback-11",
    title: "Moonlit Baobab",
    author: "Z. Mahlangu",
    genres: ["Fantasy", "Romance", "Drama"],
    status: "Ongoing",
    chapters: 6,
    views: "398K",
    synopsis:
      "Once a century, the baobab at the village's heart blooms for one night and grants its light to two strangers — this year, it picked two people who already hate each other.",
    accent: "8fae5c",
  },
  {
    id: "fallback-12",
    title: "Nomad's Cradle",
    author: "D. Osei",
    genres: ["Manhua", "Action", "Adventure"],
    status: "Ongoing",
    chapters: 10,
    views: "467K",
    synopsis:
      "A caravan guard raised to distrust every border finds the one thing worth protecting across all of them: a child the caravan itself was hired to smuggle away from her.",
    accent: "b5542e",
  },
];

function placeholderCover(title: string, accent: string): string {
  return `https://placehold.co/480x680/1a1510/${accent}?text=${encodeURIComponent(title)}`;
}

function placeholderPage(title: string, chapterNum: number, pageNum: number): string {
  return `https://placehold.co/900x1350/121009/e8ddd0?text=${encodeURIComponent(
    `${title} — Ch.${chapterNum} Pg.${pageNum}`
  )}`;
}

function toListItem(t: FallbackTitle): FallbackListItem {
  return {
    id: t.id,
    title: t.title,
    image: placeholderCover(t.title, t.accent),
    chapter: `Chapter ${t.chapters}`,
    view: t.views,
  };
}

export const FALLBACK_MANGA_LIST: FallbackListItem[] = FALLBACK_TITLES.map(toListItem);

export interface FallbackSummary {
  id: string;
  title: string;
  image: string;
  author: string;
  genres: string[];
  status: string;
  views: string;
  chapters: number;
  rating: number;
  description: string;
}

/** Full metadata (genres, status, author, rating) for every fallback title — used by Search/Explore filtering. */
export const FALLBACK_SUMMARIES: FallbackSummary[] = FALLBACK_TITLES.map((t) => ({
  id: t.id,
  title: t.title,
  image: placeholderCover(t.title, t.accent),
  author: t.author,
  genres: t.genres,
  status: t.status,
  views: t.views,
  chapters: t.chapters,
  rating: 4.2,
  description: t.synopsis,
}));

export function isFallbackId(id: string): boolean {
  return id.startsWith("fallback-");
}

export function getFallbackDetail(id: string): FallbackDetail | null {
  const t = FALLBACK_TITLES.find((x) => x.id === id);
  if (!t) return null;

  // Newest-first ordering, matching the convention real manga list APIs use.
  const chapterList: FallbackChapterSummary[] = Array.from({ length: t.chapters }, (_, i) => {
    const num = t.chapters - i;
    return {
      id: `${t.id}-ch-${num}`,
      chapter: `Chapter ${num}`,
      view: `${num * 37 + 120}`,
      createdAt: new Date(Date.now() - (i + 1) * 7 * DAY_MS).toISOString(),
    };
  });

  return {
    id: t.id,
    title: t.title,
    image: placeholderCover(t.title, t.accent),
    description: t.synopsis,
    author: t.author,
    status: t.status,
    genres: t.genres,
    chapterList,
  };
}

export function getFallbackChapterPages(chapterId: string): string[] | null {
  const match = /^(fallback-\d+)-ch-(\d+)$/.exec(chapterId);
  if (!match) return null;
  const [, mangaId, chapterNumStr] = match;
  const t = FALLBACK_TITLES.find((x) => x.id === mangaId);
  if (!t) return null;

  const chapterNum = Number(chapterNumStr);
  return Array.from({ length: 6 }, (_, i) => placeholderPage(t.title, chapterNum, i + 1));
}

export function searchFallbackManga(keyword: string): FallbackListItem[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return FALLBACK_MANGA_LIST;
  return FALLBACK_MANGA_LIST.filter((m) => m.title.toLowerCase().includes(q));
}

export function filterFallbackByGenre(genre: string): FallbackListItem[] {
  if (!genre || genre.toLowerCase() === "all") return FALLBACK_MANGA_LIST;
  return FALLBACK_TITLES.filter((t) =>
    t.genres.some((g) => g.toLowerCase() === genre.toLowerCase())
  ).map(toListItem);
}
