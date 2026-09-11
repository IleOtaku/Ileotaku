"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { proxyImg, type ContentSource } from "@/lib/manga-api";
import { Skeleton } from "@/components/ui";

export interface MangaListItemView {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
  source?: ContentSource;
  format?: string;
}

export const READER_GENRES = [
  "All",
  "Action",
  "Romance",
  "Fantasy",
  "Drama",
  "Adventure",
  "Horror",
  "Sci-fi",
  "Manhwa",
  "Comedy",
];

/** Which slice of the creator catalog Browse shows — see ReaderClient's browseTab state. */
export type BrowseTab = "all" | "manga" | "prose";

export const BROWSE_TABS: { value: BrowseTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manga", label: "Manga & Comics" },
  { value: "prose", label: "Prose Stories" },
];

export interface MangaListProps {
  items: MangaListItemView[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeGenre: string;
  onGenreChange: (genre: string) => void;
  browseTab: BrowseTab;
  onBrowseTabChange: (tab: BrowseTab) => void;
}

export function MangaThumb({
  src,
  title,
}: {
  src: string;
  title: string;
  /** Kept as an accepted (unused) prop so callers passing it from list data don't need a
   * separate code path — every result is creator-published now, so there's nothing left for a
   * per-source badge to distinguish. */
  source?: ContentSource;
}) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg3 text-xl">📖</div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyImg(src)}
      alt={title}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

interface MangaListRowProps {
  item: MangaListItemView;
  active: boolean;
  onSelect: () => void;
}

/** One row in the sidebar list — memoized since the list can hold dozens of titles and only the
 * previously/newly-selected row actually changes when the reader picks a different manga. */
const MangaListRow = memo(function MangaListRow({ item, active, onSelect }: MangaListRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex gap-3 rounded-lg p-2 text-left transition-colors ${
        active ? "bg-clay/20 ring-1 ring-clay" : "hover:bg-bg3"
      }`}
    >
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-bg3">
        <MangaThumb src={item.image} title={item.title} source={item.source} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className={`flex items-center gap-1 truncate font-syne text-xs font-semibold ${active ? "text-clay2" : "text-text"}`}>
          {item.format?.toLowerCase() === "prose" && <span className="shrink-0">📖</span>}
          <span className="truncate">{item.title}</span>
        </p>
        {item.chapter && <p className="truncate font-noto text-[11px] text-muted">{item.chapter}</p>}
        {item.view && <p className="font-noto text-[10px] text-muted">{item.view} views</p>}
      </div>
    </button>
  );
});

/** Left sidebar: search + genre chips + the scrollable manga list. Hidden on mobile. */
export default function MangaList({
  items,
  loading,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  activeGenre,
  onGenreChange,
  browseTab,
  onBrowseTabChange,
}: MangaListProps) {
  return (
    <aside className="hidden h-full w-[258px] shrink-0 flex-col border-r border-bg4 bg-bg2 md:flex">
      <div className="border-b border-bg4 p-3">
        <div className="mb-3 flex gap-1 rounded-lg bg-bg3 p-1">
          {BROWSE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onBrowseTabChange(tab.value)}
              className={`flex-1 rounded-md px-1.5 py-1.5 font-noto text-[10px] font-semibold transition-colors ${
                browseTab === tab.value ? "bg-clay text-ivory" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search creator works..."
            className="input-base pl-9 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {READER_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => onGenreChange(genre)}
              className={`rounded-full border px-2.5 py-1 font-noto text-[11px] transition-colors ${
                activeGenre === genre
                  ? "border-clay bg-clay text-ivory"
                  : "border-muted2 bg-bg3 text-muted hover:text-text"
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-lg p-2">
                <Skeleton className="h-16 w-12 shrink-0" />
                <div className="flex flex-1 flex-col gap-2 py-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          searchQuery.trim() || activeGenre !== "All" ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Search className="h-6 w-6 text-muted" />
              <p className="font-noto text-xs text-muted">
                No creator works found. Try another search or genre.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <Sparkles className="h-6 w-6 text-gold" />
              <p className="font-noto text-xs text-muted">
                No works published yet — be the first creator to publish!
              </p>
              <Link href="/creator" className="btn-primary text-xs">
                Become a Creator
              </Link>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <MangaListRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
