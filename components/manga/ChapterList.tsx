"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { MangaChapterSummary } from "@/lib/manga-api";

export interface ChapterListProps {
  mangaId: string;
  chapters: MangaChapterSummary[];
}

/** Per-chapter lock indicator — every chapter's own author sets its coinPrice (0 for free),
 * bypassed entirely for Platinum members, matching lib/contentLocking.ts's getLockConfig(). */
export default function ChapterList({ mangaId, chapters }: ChapterListProps) {
  const { profile } = useAuth();
  const isPlatinum = profile?.isPlatinum === true;

  return (
    <div className="flex flex-col gap-1.5">
      {chapters.map((chapter) => {
        const locked = !isPlatinum && (chapter.coinPrice ?? 0) > 0;

        return (
          <Link
            key={chapter.id}
            href={`/reader?id=${encodeURIComponent(mangaId)}&chapter=${chapters.indexOf(chapter)}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-bg4 bg-bg2 px-4 py-3 transition-colors hover:border-clay"
          >
            <span className="flex items-center gap-2 font-noto text-sm text-text">
              {locked && (
                <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold2">
                  <Coins className="h-3 w-3" /> {chapter.coinPrice}
                </span>
              )}
              {chapter.chapter}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              {chapter.createdAt && <span>{new Date(chapter.createdAt).toLocaleDateString()}</span>}
              <span className="rounded bg-bg4 px-1.5 py-0.5 text-[10px] font-semibold">EN</span>
            </span>
          </Link>
        );
      })}
      {chapters.length === 0 && (
        <p className="font-noto text-sm text-muted">No chapters available yet.</p>
      )}
    </div>
  );
}
