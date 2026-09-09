"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { EngagementTier } from "@/lib/contentLocking";
import type { ContentSource, MangaChapterSummary } from "@/lib/manga-api";

const FREE_CHAPTER_COUNT = 7;
const COIN_PRICE: Partial<Record<EngagementTier, number>> = { high: 10, viral: 20 };

export interface ChapterListProps {
  mangaId: string;
  chapters: MangaChapterSummary[];
  /** Only meaningful for imported sources — ignored (every chapter reads as free) otherwise. */
  engagementTier: EngagementTier;
  source: ContentSource | undefined;
}

/** Per-chapter lock indicator, matching lib/contentLocking.ts's getLockConfig() precedence
 * exactly (free chapters → Platinum → non-imported source → tier) but computed client-side
 * from data the server already fetched once, rather than re-deriving a lock per chapter. */
export default function ChapterList({ mangaId, chapters, engagementTier, source }: ChapterListProps) {
  const { profile } = useAuth();
  const isImported = source === "mangadex" || source === "comick" || source === "mangahook";
  const isCreator = source === "creator";
  const isPlatinum = profile?.isPlatinum === true;

  return (
    <>
      {isImported && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-clay/30 bg-clay/5 px-3 py-1.5 font-noto text-xs text-clay2">
          Chapters 1–7 always free · Unlock more with coins or Platinum 💎
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {chapters.map((chapter, i) => {
          const isFree = i < FREE_CHAPTER_COUNT || !isImported || isPlatinum;
          const tierGate = isFree ? null : engagementTier;
          const creatorLocked = isCreator && !isPlatinum && (chapter.coinPrice ?? 0) > 0;

          return (
            <Link
              key={chapter.id}
              href={`/reader?id=${encodeURIComponent(mangaId)}&chapter=${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-bg4 bg-bg2 px-4 py-3 transition-colors hover:border-clay"
            >
              <span className="flex items-center gap-2 font-noto text-sm text-text">
                {tierGate === "medium" && (
                  <span className="flex items-center gap-1 rounded-full bg-bg3 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    📺 Ad
                  </span>
                )}
                {(tierGate === "high" || tierGate === "viral") && (
                  <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold2">
                    <Coins className="h-3 w-3" /> {COIN_PRICE[tierGate]}
                  </span>
                )}
                {creatorLocked && (
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
    </>
  );
}
