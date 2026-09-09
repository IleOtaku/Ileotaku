"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { canViewReadingActivity, subscribeToReadingActivity } from "@/lib/readingActivity";
import { proxyImg } from "@/lib/manga-api";
import type { ReadingActivity, UserProfile } from "@/types";

export interface CurrentlyReadingCardProps {
  /** The profile being viewed — used for the privacy check (showReadingActivity /
   * readingActivityVisibility) against the signed-in viewer, if any. */
  target: UserProfile;
}

/** Same "still actually doing this" freshness window NowPlayingCard and FriendActivity use —
 * a stale `isReading: true` doc (e.g. a tab closed without the reader's unmount cleanup ever
 * running) shouldn't show "reading now" forever. */
const RIGHT_NOW_WINDOW_MS = 10 * 60_000;

/**
 * "Currently Reading" card for a public profile/creator page — shown ONLY while its subject is
 * actively reading right now. Deliberately shows nothing at all otherwise (no "last read X ago"
 * fallback) — the spec calls a last-read fallback "too intrusive", so an inactive reader's card
 * silently renders null rather than degrading to a stale-history view.
 */
export default function CurrentlyReadingCard({ target }: CurrentlyReadingCardProps) {
  const { user } = useAuth();
  const [activity, setActivity] = useState<ReadingActivity | null>(null);

  useEffect(() => {
    if (!canViewReadingActivity(target, user?.uid)) {
      setActivity(null);
      return;
    }
    return subscribeToReadingActivity(target.uid, setActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.uid, target.showReadingActivity, target.readingActivityVisibility, user?.uid]);

  if (!activity?.isReading) return null;
  if (Date.now() - new Date(activity.lastUpdatedAt).getTime() >= RIGHT_NOW_WINDOW_MS) return null;

  return (
    <Link
      href={`/reader?id=${encodeURIComponent(activity.seriesId)}`}
      className="flex items-center gap-3 rounded-2xl border border-clay/30 bg-clay/5 p-4 transition-colors hover:border-clay"
    >
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-bg3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            loading="lazy"
          src={proxyImg(activity.coverImage)}
          alt={activity.seriesTitle}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-syne text-xs font-semibold text-clay2">
          Reading now 📖
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        </p>
        <p className="truncate font-noto text-sm font-semibold text-text">{activity.seriesTitle}</p>
        <p className="font-noto text-xs text-muted">Chapter {activity.chapterTitle}</p>
      </div>
    </Link>
  );
}
