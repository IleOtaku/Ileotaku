"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMangaDetail, proxyImg } from "@/lib/manga-api";

interface ContinueReadingItem {
  id: string;
  title: string;
  image: string;
}

export interface ContinueReadingRowProps {
  mangaIds: string[];
}

/** Fetches detail for each saved manga id client-side and renders them as a horizontal scroll row. */
export default function ContinueReadingRow({ mangaIds }: ContinueReadingRowProps) {
  const [items, setItems] = useState<ContinueReadingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mangaIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      mangaIds.slice(0, 10).map(async (id) => {
        try {
          const res = await getMangaDetail(id);
          return { id, title: res.data.title, image: res.data.image };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setItems(results.filter((r): r is ContinueReadingItem => r !== null));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mangaIds]);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-48 w-32 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="font-noto text-sm text-muted">
        Nothing in progress yet —{" "}
        <Link href="/explore" className="text-gold hover:underline">
          explore the catalog
        </Link>{" "}
        to start your first series.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {items.map((item) => (
        <Link key={item.id} href={`/manga/${encodeURIComponent(item.id)}`} className="group w-32 shrink-0">
          <div className="aspect-[3/4] w-32 overflow-hidden rounded-xl border border-bg4 bg-bg2">
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
      ))}
    </div>
  );
}
