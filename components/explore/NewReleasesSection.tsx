"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Zap } from "lucide-react";
import { getMangaStatsBatch, type EngagementTier } from "@/lib/contentLocking";
import { proxyImg, type MangaListItem } from "@/lib/manga-api";

export interface NewReleasesSectionProps {
  items: MangaListItem[];
}

/** New Releases grid, plus the two pieces of Sprint 9c UI that only make sense against *real*
 * (mangadex/comick/mangahook-backed) ids: the 🔥 Popular / ⚡ Viral badges, and the "Free to
 * Read" toggle. Every other Explore section (Editor's Picks, Hall of Fame, Rising, Platinum
 * Exclusives' fallback) is built from the hardcoded demo catalog, whose ids never accumulate
 * real `mangaStats` — so those stay untouched rather than wired to a stats lookup that could
 * only ever return "low" for them. */
export default function NewReleasesSection({ items }: NewReleasesSectionProps) {
  const [tiers, setTiers] = useState<Record<string, EngagementTier>>({});
  const [freeOnly, setFreeOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMangaStatsBatch(items.slice(0, 8).map((i) => i.id)).then((stats) => {
      if (cancelled) return;
      const next: Record<string, EngagementTier> = {};
      for (const [id, s] of Object.entries(stats)) next[id] = s.engagementTier;
      setTiers(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const visible = items
    .slice(0, 8)
    .filter((item) => !freeOnly || (tiers[item.id] ?? "low") === "low");

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-2 font-noto text-xs text-muted">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-muted2 accent-clay"
          />
          Free to Read only
        </label>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {visible.map((item) => {
          const tier = tiers[item.id];
          return (
            <Link key={item.id} href={`/manga/${encodeURIComponent(item.id)}`} className="group relative w-36 shrink-0">
              {tier === "high" && (
                <span className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-clay/90 px-2 py-0.5 font-syne text-[10px] font-bold text-ivory">
                  <Flame className="h-3 w-3" /> Popular
                </span>
              )}
              {tier === "viral" && (
                <span className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-gold/90 px-2 py-0.5 font-syne text-[10px] font-bold text-bg">
                  <Zap className="h-3 w-3" /> Viral
                </span>
              )}
              <div className="aspect-[3/4] w-36 overflow-hidden rounded-xl border border-bg4 bg-bg2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
            loading="lazy"
                  src={proxyImg(item.image)}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className="mt-2 truncate font-syne text-xs font-semibold text-text">{item.title}</p>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <p className="py-6 font-noto text-sm text-muted">No free-to-read titles match right now.</p>
        )}
      </div>
    </>
  );
}
