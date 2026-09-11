"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { BROWSE_TABS, MangaThumb, READER_GENRES, type BrowseTab, type MangaListItemView } from "./MangaList";

export interface MobileBrowseSheetProps {
  open: boolean;
  onClose: () => void;
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

/**
 * Full-screen mobile manga browser — the mobile equivalent of the desktop MangaList sidebar,
 * opened from the reader's bottom tab bar. Stays mounted at all times (visibility toggled via
 * transform/opacity rather than unmounting) so its internal scroll position survives being
 * closed and reopened. Supports swipe-down-to-dismiss via a drag handle.
 */
export default function MobileBrowseSheet({
  open,
  onClose,
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
}: MobileBrowseSheetProps) {
  return (
    <motion.div
      aria-hidden={!open}
      initial={false}
      animate={open ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className={`fixed inset-0 z-[110] flex flex-col bg-bg md:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Drag handle: the only part of the sheet that responds to swipe-down-to-dismiss, so
          dragging doesn't fight with the scrollable manga list underneath it. */}
      <motion.div
        drag={open ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 500) onClose();
        }}
        className="flex shrink-0 cursor-grab flex-col items-center gap-2 border-b border-bg4 pb-3 pt-3 active:cursor-grabbing"
      >
        <div className="h-1 w-10 rounded-full bg-bg4" />
        <div className="flex w-full items-center justify-between px-4">
          <h2 className="font-cinzel text-lg text-gold">Browse Manga</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close browse"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </motion.div>

      <div className="shrink-0 border-b border-bg4 p-3">
        <div className="mb-3 flex gap-1 rounded-lg bg-bg3 p-1">
          {BROWSE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onBrowseTabChange(tab.value)}
              className={`min-h-[36px] flex-1 rounded-md px-1.5 font-noto text-[11px] font-semibold transition-colors ${
                browseTab === tab.value ? "bg-clay text-ivory" : "text-muted"
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
            className="input-base pl-9"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {READER_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => onGenreChange(genre)}
              className={`min-h-[36px] shrink-0 rounded-full border px-3.5 font-noto text-xs transition-colors ${
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 rounded-xl p-2">
                <Skeleton className="h-28 w-20 shrink-0" />
                <div className="flex flex-1 flex-col gap-2 py-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          searchQuery.trim() || activeGenre !== "All" ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Search className="h-8 w-8 text-muted" />
              <p className="font-noto text-sm text-muted">No creator works found. Try another search or genre.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <Sparkles className="h-8 w-8 text-gold" />
              <p className="font-noto text-sm text-muted">
                No works published yet — be the first!
              </p>
              <Link href="/creator" className="btn-primary text-sm">
                Become a Creator
              </Link>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`flex gap-4 rounded-xl p-2 text-left transition-colors ${
                    active ? "bg-clay/20 ring-1 ring-clay" : "hover:bg-bg3"
                  }`}
                >
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-bg3">
                    <MangaThumb src={item.image} title={item.title} source={item.source} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <p className={`flex items-center gap-1 truncate font-syne text-base font-semibold ${active ? "text-clay2" : "text-text"}`}>
                      {item.format?.toLowerCase() === "prose" && <span className="shrink-0">📖</span>}
                      <span className="truncate">{item.title}</span>
                    </p>
                    {item.chapter && <p className="truncate font-noto text-sm text-muted">{item.chapter}</p>}
                    {item.view && <p className="font-noto text-xs text-muted">{item.view} views</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
