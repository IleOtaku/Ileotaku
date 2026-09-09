"use client";

import { memo, useState } from "react";
import { Search } from "lucide-react";
import { proxyImg, type ContentSource } from "@/lib/manga-api";
import { Skeleton } from "@/components/ui";
import SourceBadge from "./SourceBadge";

export interface MangaListItemView {
  id: string;
  title: string;
  image: string;
  chapter?: string;
  view?: string;
  source?: ContentSource;
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

export interface MangaListProps {
  items: MangaListItemView[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeGenre: string;
  onGenreChange: (genre: string) => void;
}

export function MangaThumb({
  src,
  title,
  source,
}: {
  src: string;
  title: string;
  source?: ContentSource;
}) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-bg3 text-xl">
        📖
        <SourceBadge source={source} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyImg(src)}
        alt={title}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setError(true)}
      />
      <SourceBadge source={source} />
    </div>
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
        <p className={`truncate font-syne text-xs font-semibold ${active ? "text-clay2" : "text-text"}`}>
          {item.title}
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
}: MangaListProps) {
  return (
    <aside className="hidden h-full w-[258px] shrink-0 flex-col border-r border-bg4 bg-bg2 md:flex">
      <div className="border-b border-bg4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search manga..."
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
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <Search className="h-6 w-6 text-muted" />
            <p className="font-noto text-xs text-muted">
              No manga found. Try another search or genre.
            </p>
          </div>
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
