"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { proxyImg } from "@/lib/manga-api";
import { getLatestFromFollowing } from "@/lib/publishedSeries";
import type { PublishedSeries } from "@/types";

export interface LatestFromFollowingSectionProps {
  followingUids: string[];
}

/** Home feed's "Latest from Creators You Follow" — every published work (manga or prose) by an
 * author the signed-in reader follows, newest first. */
export default function LatestFromFollowingSection({ followingUids }: LatestFromFollowingSectionProps) {
  const [items, setItems] = useState<PublishedSeries[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (followingUids.length === 0) {
      setItems([]);
      return;
    }
    getLatestFromFollowing(followingUids, 8)
      .then((res) => {
        if (!cancelled) setItems(res);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [followingUids]);

  if (items === null) {
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
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-muted2 px-4 py-6 font-noto text-sm text-muted">
        <UsersRound className="h-5 w-5 shrink-0" />
        <span>
          Follow creators to see their latest works —{" "}
          <Link href="/search?tab=people&filter=creators" className="text-gold hover:underline">
            find some to follow
          </Link>
          .
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {items.map((work) => (
        <Link
          key={work.id}
          href={work.format?.toLowerCase() === "prose" ? `/story/${work.id}` : `/manga/${encodeURIComponent(work.id)}`}
          className="group w-32 shrink-0"
        >
          <div className="aspect-[3/4] w-32 overflow-hidden rounded-xl border border-bg4 bg-bg2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              src={proxyImg(work.coverImage)}
              alt={work.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <p className="mt-2 truncate font-syne text-xs font-semibold text-text">{work.title}</p>
          <p className="truncate font-noto text-[11px] text-muted">{work.authorName}</p>
        </Link>
      ))}
    </div>
  );
}
