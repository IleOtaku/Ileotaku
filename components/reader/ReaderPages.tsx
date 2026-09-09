"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { proxyImg, type MangaDetailResponse } from "@/lib/manga-api";
import type { ReaderTheme } from "@/types";

export interface ReaderPagesProps {
  detail: MangaDetailResponse["data"] | null;
  detailLoading: boolean;
  pages: string[];
  pagesLoading: boolean;
  mode: "scroll" | "paged";
  /** Changes whenever the active chapter changes, so this component knows to reset scroll. */
  chapterKey: string;
  /** Platinum-only HD mode — applies a light sharpen/contrast filter to every page image. */
  hdEnabled?: boolean;
  /** Reading theme (Sprint 9e) — recolors the reading surface (background, footer, page-count
   * text, progress bar) around the page images themselves, which stay as-is. Defaults to "dark",
   * which intentionally matches this component's original hardcoded bg/text classes exactly
   * (via undefined styleOverride below) rather than duplicating those hex values here. */
  theme?: ReaderTheme;
  /** Sprint 10 — fires on every scroll-progress recalculation so ReaderClient can show the
   * between-chapters ad card once the reader nears the end (progress >= 95%). */
  onProgressChange?: (pct: number) => void;
}

/** Palette for every non-default theme, keyed the same as ReadingPreferences["theme"]. "dark"
 * and the deprecated "light" alias are omitted deliberately — they fall through to this
 * component's original Tailwind classes (bg-bg/bg-bg2/bg-bg4/text-muted) instead of an inline
 * override, so the free default theme's appearance can't drift from this palette by accident. */
const READER_THEME_STYLES: Partial<Record<ReaderTheme, { bg: string; footerBg: string; border: string; text: string; muted: string }>> = {
  sepia: { bg: "#f4ecd8", footerBg: "#ece0c4", border: "#d9c9a3", text: "#3b2f1f", muted: "#7a6a4f" },
  midnight: { bg: "#05070f", footerBg: "#0a0e1c", border: "#1a2138", text: "#dbe4ff", muted: "#6b7aa1" },
  sakura: { bg: "#fdf1f5", footerBg: "#fbe4ec", border: "#f3c8d6", text: "#5c2436", muted: "#b97b93" },
  matrix: { bg: "#020c02", footerBg: "#041604", border: "#0d2e0d", text: "#39ff6a", muted: "#1f7a33" },
};

/** The actual reading surface: empty/loading/error states, scroll or paged rendering, progress bar. */
export default function ReaderPages({
  detail,
  detailLoading,
  pages,
  pagesLoading,
  mode,
  chapterKey,
  hdEnabled = false,
  theme = "dark",
  onProgressChange,
}: ReaderPagesProps) {
  const imageStyle = hdEnabled ? { filter: "contrast(1.1) saturate(1.05)" } : undefined;
  const palette = READER_THEME_STYLES[theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [progress, setProgress] = useState(0);

  // Reset reading position whenever the chapter (or mode) changes.
  useEffect(() => {
    setCurrentPage(1);
    setProgress(0);
    onProgressChange?.(0);
    const el = containerRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey, mode]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el || pages.length === 0) return;

    if (mode === "scroll") {
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0;
      setProgress(pct);
      onProgressChange?.(pct);
      setCurrentPage(Math.min(pages.length, Math.max(1, Math.round((pct / 100) * pages.length) || 1)));
    } else {
      const max = el.scrollWidth - el.clientWidth;
      const pct = max > 0 ? Math.min(100, Math.round((el.scrollLeft / max) * 100)) : 0;
      setProgress(pct);
      onProgressChange?.(pct);
      const pageWidth = el.clientWidth || 1;
      setCurrentPage(Math.min(pages.length, Math.max(1, Math.round(el.scrollLeft / pageWidth) + 1)));
    }
  }

  function goToPageIndex(index: number) {
    const el = containerRef.current;
    if (!el || mode !== "paged") return;
    const clamped = Math.min(pages.length - 1, Math.max(0, index));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "paged") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    goToPageIndex(currentPage - 1 + (isLeft ? -1 : 1));
  }

  if (detailLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="font-noto text-sm">Loading manga details...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
        <span className="text-6xl">📖</span>
        <h2 className="font-cinzel text-xl text-text">Your Story Awaits</h2>
        <p className="max-w-xs font-noto text-sm">
          Search or pick a title from the list to start reading.
        </p>
      </div>
    );
  }

  if (pagesLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="font-noto text-sm">Loading chapter pages...</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
        <span className="text-5xl">⚠️</span>
        <h2 className="font-cinzel text-lg text-text">This chapter couldn&apos;t load</h2>
        <p className="max-w-xs font-noto text-sm">
          Try another chapter from the dropdown above, or check back later.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden bg-bg"
      style={palette ? { backgroundColor: palette.bg } : undefined}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onClick={handleTap}
        className={
          mode === "scroll"
            ? "flex-1 overflow-y-auto overflow-x-hidden"
            : "flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        }
      >
        {mode === "scroll" ? (
          <div className="mx-auto flex max-w-[740px] flex-col">
            {pages.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={proxyImg(src, hdEnabled)}
                alt={`Page ${i + 1}`}
                className="w-full"
                style={imageStyle}
                loading={i < 3 ? "eager" : "lazy"}
              />
            ))}
          </div>
        ) : (
          pages.map((src, i) => (
            <div
              key={i}
              className="flex h-full w-full shrink-0 snap-center items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyImg(src, hdEnabled)}
                alt={`Page ${i + 1}`}
                className="h-full w-auto object-contain"
                style={imageStyle}
                loading={i < 3 ? "eager" : "lazy"}
              />
            </div>
          ))
        )}
      </div>

      <div
        className="border-t border-bg4 bg-bg2 px-3 py-2"
        style={palette ? { backgroundColor: palette.footerBg, borderColor: palette.border } : undefined}
      >
        <div
          className="mb-1.5 flex items-center justify-between font-noto text-[11px] text-muted"
          style={palette ? { color: palette.muted } : undefined}
        >
          <span>
            Page {currentPage} / {pages.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-bg4"
          style={palette ? { backgroundColor: palette.border } : undefined}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-clay to-gold transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
