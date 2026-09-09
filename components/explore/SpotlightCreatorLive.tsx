"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import FollowButton from "@/components/social/FollowButton";
import { Avatar } from "@/components/ui/Avatar";
import { getCreatorStats, getPopularCreators } from "@/lib/firestore";
import type { UserProfile } from "@/types";

/**
 * Real "Creator of the week" card, backed by an actual ÍléOtaku account (the most-followed
 * creator, via getPopularCreators — same query the search page's People tab already trusts for
 * a client-side read of the whole users collection).
 *
 * Replaces what used to be a permanently-static FALLBACK_SUMMARIES entry with a bare
 * `<button>Follow</button>` that had no onClick at all — confirmed live as one of the concrete
 * "follow button doesn't work" spots: there was no real creator uid here for a follow to even
 * target. Falls back to nothing (section stays hidden) rather than re-introducing a fake,
 * non-functional Follow button once no real creator exists yet.
 */
export default function SpotlightCreatorLive() {
  const [creator, setCreator] = useState<UserProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<{ publishedCount: number; totalReads: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPopularCreators(1)
      .then((list) => {
        if (cancelled) return;
        const top = list[0] ?? null;
        setCreator(top);
        if (top) {
          getCreatorStats(top.uid)
            .then((s) => !cancelled && setStats(s))
            .catch(() => !cancelled && setStats(null));
        }
      })
      .catch(() => !cancelled && setCreator(null));
    return () => {
      cancelled = true;
    };
  }, []);

  if (creator === undefined) {
    return <div className="h-32 animate-pulse rounded-2xl border border-bg4 bg-bg2" />;
  }
  if (!creator) return null;

  const followerCount = creator.followers?.length ?? 0;

  return (
    <div className="grid gap-6 rounded-2xl border border-bg4 bg-bg2 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <Avatar
        uid={creator.uid}
        photoURL={creator.photoURL}
        displayName={creator.displayName}
        size={64}
        className="font-cinzel text-xl"
      />
      <div>
        <p className="flex items-center gap-2 font-syne text-base font-semibold text-text">
          {creator.displayName}
          {creator.handle && (
            <span className="rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-clay2">
              <Globe2 className="mr-1 inline h-3 w-3" /> @{creator.handle}
            </span>
          )}
        </p>
        <p className="mt-1 max-w-md font-noto text-xs text-muted">
          {creator.bio ||
            (stats
              ? `${stats.publishedCount.toLocaleString()} series published, ${stats.totalReads.toLocaleString()} reads.`
              : "Building worlds where African folklore meets the far future.")}
        </p>
        <p className="mt-3 font-noto text-xs text-muted">
          {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
        </p>
      </div>
      <FollowButton targetUid={creator.uid} initialFollowerCount={followerCount} hideCount />
    </div>
  );
}
