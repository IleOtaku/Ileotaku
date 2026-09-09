"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Info,
  Lock,
  Palette,
  Sparkles,
  WifiOff,
} from "lucide-react";
import PlatinumGate from "@/components/monetisation/PlatinumGate";
import DownloadChapterButton from "./DownloadChapterButton";
import { useChatUnread } from "@/hooks/useChatUnread";
import { isChapterDownloaded } from "@/lib/offlineReader";
import ChapterSelectSheet from "./ChapterSelectSheet";
import { truncate } from "@/lib/utils";
import { PLATINUM_READER_THEMES, type ReaderTheme } from "@/types";

const THEME_SWATCHES: { value: ReaderTheme; label: string; swatch: string }[] = [
  { value: "dark", label: "Dark", swatch: "#0c0a07" },
  { value: "sepia", label: "Sepia", swatch: "#f4ecd8" },
  { value: "midnight", label: "Midnight", swatch: "#05070f" },
  { value: "sakura", label: "Sakura", swatch: "#fdf1f5" },
  { value: "matrix", label: "Matrix", swatch: "#020c02" },
];

export interface ReaderToolbarChapter {
  id: string;
  chapter: string;
}

export interface ReaderToolbarProps {
  title: string;
  /** External manga id — powers the breadcrumb's link to /manga/[id]. Null while nothing's selected. */
  mangaId: string | null;
  chapterLabel: string;
  chapters: ReaderToolbarChapter[];
  chapterIndex: number;
  onChapterIndexChange: (idx: number) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  mode: "scroll" | "paged";
  onModeChange: (mode: "scroll" | "paged") => void;
  hdEnabled: boolean;
  onToggleHd: () => void;
  /** Opens the mobile Details/Chapters/Comments/Chat bottom sheet. Only the icon that
   * triggers it renders here — the sheet itself stays owned by ReaderClient alongside the
   * other mobile sheets. */
  onOpenDetails: () => void;
  /** Bumped by ReaderClient each time the mobile Chat tab is opened, so the unread dot below
   * clears immediately instead of waiting for the next new message. */
  chatReadSignal: number;
  /** Cover art URL, used as download metadata when a Platinum user saves this chapter offline. */
  coverURL: string;
  /** Current chapter's page image URLs — what actually gets downloaded for offline reading. */
  pages: string[];
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  isPlatinum: boolean;
}

/** Top bar of the reader: home + breadcrumb, chapter badge, chapter nav + dropdown, mode toggle, HD/Offline. */
export default function ReaderToolbar({
  title,
  mangaId,
  chapterLabel,
  chapters,
  chapterIndex,
  onChapterIndexChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
  mode,
  onModeChange,
  hdEnabled,
  onToggleHd,
  onOpenDetails,
  chatReadSignal,
  coverURL,
  pages,
  theme,
  onThemeChange,
  isPlatinum,
}: ReaderToolbarProps) {
  const router = useRouter();
  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const hasUnreadChat = useChatUnread(mangaId, chatReadSignal);
  const currentChapterId = chapters[chapterIndex]?.id;
  const [readingOffline, setReadingOffline] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    if (!currentChapterId) {
      setReadingOffline(false);
      return;
    }
    let cancelled = false;
    isChapterDownloaded(currentChapterId).then((v) => {
      if (!cancelled) setReadingOffline(v);
    });
    return () => {
      cancelled = true;
    };
  }, [currentChapterId]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-bg4 bg-bg2 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Go home"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg3 hover:text-gold"
        >
          <Home className="h-4 w-4" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 font-noto text-xs text-muted">
          <Link href="/" className="shrink-0 transition-colors hover:text-gold">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          {mangaId ? (
            <Link
              href={`/manga/${encodeURIComponent(mangaId)}`}
              title={title}
              className="truncate font-syne text-sm font-semibold text-text transition-colors hover:text-clay2"
            >
              {truncate(title, 40)}
            </Link>
          ) : (
            <span className="truncate font-syne text-sm font-semibold text-text" title={title}>
              {truncate(title, 40)}
            </span>
          )}
        </nav>

        {chapterLabel && (
          <span className="shrink-0 rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[11px] font-semibold text-clay2">
            {chapterLabel}
          </span>
        )}

        {mode === "paged" && readingOffline && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 font-noto text-[11px] font-semibold text-green2">
            <WifiOff className="h-3 w-3" /> Reading offline
          </span>
        )}

        <button
          type="button"
          onClick={onOpenDetails}
          aria-label="Series details, comments & chat"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg3 hover:text-gold md:hidden"
        >
          <Info className="h-4 w-4" />
          {hasUnreadChat && (
            <span
              aria-label="Unread chat messages"
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-clay"
            />
          )}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg3 hover:text-clay2 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Previous chapter"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Desktop/tablet: compact native select. Mobile: a tappable button opening a full
            bottom-sheet picker instead — a native <select> is too small a tap target and its
            OS picker UI is awkward on touch. */}
        <select
          value={chapterIndex}
          onChange={(e) => onChapterIndexChange(Number(e.target.value))}
          disabled={chapters.length === 0}
          className="hidden max-w-[160px] rounded-lg border border-muted2 bg-bg3 px-2 py-1.5 font-noto text-xs text-text focus:border-gold focus:outline-none md:block"
        >
          {chapters.map((c, i) => (
            <option key={c.id} value={i}>
              {c.chapter}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setChapterSheetOpen(true)}
          disabled={chapters.length === 0}
          className="flex min-h-[44px] max-w-[160px] items-center gap-1 rounded-lg border border-muted2 bg-bg3 px-2.5 font-noto text-xs text-text disabled:opacity-40 md:hidden"
        >
          <span className="truncate">{chapters[chapterIndex]?.chapter ?? "No chapters"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>

        <ChapterSelectSheet
          open={chapterSheetOpen}
          onClose={() => setChapterSheetOpen(false)}
          chapters={chapters}
          chapterIndex={chapterIndex}
          onSelect={onChapterIndexChange}
        />

        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg3 hover:text-clay2 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Next chapter"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onModeChange(mode === "scroll" ? "paged" : "scroll")}
          className="rounded-lg border border-clay bg-clay/15 px-2.5 py-1.5 font-noto text-xs font-semibold text-clay2 transition-colors hover:bg-clay/25"
        >
          {mode === "scroll" ? "⇅ Scroll" : "⇆ Paged"}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setThemeMenuOpen((o) => !o)}
            aria-label="Reading theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-muted2 bg-bg3 text-muted transition-colors hover:border-clay hover:text-clay2"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
          {themeMenuOpen && (
            <div className="glass absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg p-1.5">
              {THEME_SWATCHES.map((t) => {
                const locked = PLATINUM_READER_THEMES.includes(t.value) && !isPlatinum;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      if (locked) return;
                      onThemeChange(t.value);
                      setThemeMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-noto text-xs ${
                      locked ? "cursor-not-allowed text-muted opacity-60" : "text-text hover:bg-bg4"
                    } ${theme === t.value ? "bg-bg4" : ""}`}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted2"
                      style={{ backgroundColor: t.swatch }}
                    />
                    {t.label}
                    {locked && <Lock className="ml-auto h-3 w-3 shrink-0" />}
                  </button>
                );
              })}
              {!isPlatinum && (
                <Link
                  href="/pricing"
                  onClick={() => setThemeMenuOpen(false)}
                  className="mt-1 block rounded-md px-2.5 py-2 text-center font-noto text-[11px] font-semibold text-plat hover:bg-bg4"
                >
                  Unlock all themes with Platinum
                </Link>
              )}
            </div>
          )}
        </div>

        <PlatinumGate compact title="HD" description="HD page quality is a Platinum feature.">
          <button
            type="button"
            onClick={onToggleHd}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-noto text-xs transition-colors ${
              hdEnabled
                ? "border-clay bg-clay/15 text-clay2"
                : "border-muted2 bg-bg3 text-muted hover:border-clay hover:text-clay2"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> HD
          </button>
        </PlatinumGate>

        {mangaId && currentChapterId && (
          <DownloadChapterButton
            mangaId={mangaId}
            chapterId={currentChapterId}
            mangaTitle={title}
            coverURL={coverURL}
            chapterLabel={chapterLabel}
            pages={pages}
          />
        )}
      </div>
    </div>
  );
}
