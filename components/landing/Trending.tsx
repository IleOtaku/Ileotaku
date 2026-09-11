"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionEyebrow, Skeleton } from "@/components/ui";
import { proxyImg } from "@/lib/manga-api";
import { getTrendingPublishedSeries } from "@/lib/publishedSeries";
import type { PublishedSeries } from "@/types";
import Reveal from "./Reveal";

/**
 * Explore's "Trending by reads" rail (also reused on Home, signed-in view) — the highest-
 * totalReads creator works across every format, newest-read-count-first. All content is now
 * creator-published (see lib/publishedSeries.ts); this used to fetch MangaDex/Comick/MangaHook's
 * own trending list client-side, back when those catalogs blocked server-side requests.
 */
export default function Trending() {
  const [items, setItems] = useState<PublishedSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getTrendingPublishedSeries(6)
      .then((res) => {
        if (!cancelled) setItems(res);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <Reveal>
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <SectionEyebrow>Trending by Reads</SectionEyebrow>
            <h2 className="font-cinzel text-2xl text-text sm:text-3xl">
              What everyone&apos;s reading
            </h2>
          </div>
          <Link
            href="/explore"
            className="hidden font-syne text-sm text-gold hover:underline sm:block"
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))
            : items.map((item, i) => (
                <Link
                  key={item.id}
                  href={
                    item.format?.toLowerCase() === "prose"
                      ? `/story/${item.id}`
                      : `/manga/${encodeURIComponent(item.id)}`
                  }
                  className="group relative overflow-hidden rounded-xl border border-bg4 bg-bg2 transition-transform hover:-translate-y-1"
                >
                  <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-clay font-syne text-xs font-bold text-ivory">
                    {i + 1}
                  </span>
                  <div className="aspect-[3/4] w-full overflow-hidden bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proxyImg(item.coverImage)}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate font-syne text-xs font-semibold text-text">{item.title}</p>
                    <p className="mt-0.5 font-noto text-[11px] text-muted">
                      {(item.totalReads ?? 0).toLocaleString()} reads
                    </p>
                  </div>
                </Link>
              ))}
        </div>
      </Reveal>
    </section>
  );
}
