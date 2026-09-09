"use client";

import { useEffect, useState } from "react";
import { FALLBACK_SUMMARIES } from "@/lib/fallback-manga";
import { getMangaList, type MangaListItem } from "@/lib/manga-api";
import { Skeleton } from "@/components/ui";
import NewReleasesSection from "./NewReleasesSection";

/**
 * Fetches the live New Releases list client-side (see MangaDetailClient's comment for why —
 * MangaDex/Comick/MangaHook block datacenter IPs, Vercel's included, but not browser traffic)
 * and hands it to NewReleasesSection, falling back to the offline demo catalog if the live
 * fetch comes back empty — the same fallback app/explore/page.tsx used to do server-side.
 */
export default function NewReleasesLive() {
  const [items, setItems] = useState<MangaListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMangaList(1)
      .then((res) => {
        if (!cancelled) setItems(res.data.mangaList.length > 0 ? res.data.mangaList : FALLBACK_SUMMARIES);
      })
      .catch(() => {
        if (!cancelled) setItems(FALLBACK_SUMMARIES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
        ))}
      </div>
    );
  }

  return <NewReleasesSection items={items} />;
}
