"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { FALLBACK_SUMMARIES } from "@/lib/fallback-manga";
import { getMangaList, proxyImg } from "@/lib/manga-api";
import { Skeleton } from "@/components/ui";

export interface PlatinumExclusivesLiveProps {
  /** highViralIds — Firestore mangaStats ids at the high/viral engagement tier, computed
   * server-side (Firestore isn't affected by the MangaDex IP block, so that part stays as-is)
   * and passed down so this component only has to do the MangaDex-list part client-side. */
  highViralIds: string[];
}

type ExclusiveItem = { id: string; title: string; image: string };

/** Grid-only piece of Explore's Platinum Exclusives rail — see MangaDetailClient's comment for
 * why the MangaDex list fetch behind it has to run in the browser, not on the server. */
export default function PlatinumExclusivesLive({ highViralIds }: PlatinumExclusivesLiveProps) {
  const [items, setItems] = useState<ExclusiveItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMangaList(1)
      .then((res) => {
        if (cancelled) return;
        const realExclusives = highViralIds
          .map((id) => res.data.mangaList.find((m) => m.id === id))
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({ id: m.id, title: m.title, image: m.image }));
        setItems(realExclusives.length >= 3 ? realExclusives : FALLBACK_SUMMARIES.slice(3, 6));
      })
      .catch(() => {
        if (!cancelled) setItems(FALLBACK_SUMMARIES.slice(3, 6));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-plat/30 bg-bg2">
          <div className="aspect-[3/4] overflow-hidden bg-bg3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              src={proxyImg(item.image)}
              alt={item.title}
              className="h-full w-full object-cover blur-sm scale-105"
            />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/60">
            <Lock className="h-6 w-6 text-plat2" />
            <p className="px-4 text-center font-syne text-xs font-semibold text-ivory">{item.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
