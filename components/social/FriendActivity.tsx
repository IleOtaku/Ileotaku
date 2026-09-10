"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { subscribeToFollowingActivity, type FollowingActivityEntry } from "@/lib/readingActivity";
import { proxyImg } from "@/lib/manga-api";

const MAX_SHOWN = 8;
/** "Right now" vs a relative timestamp — mirrors the 10-minute window Sprint 9d's NowPlaying
 * green dot already uses for the same "still actually doing this" signal. */
const RIGHT_NOW_WINDOW_MS = 10 * 60_000;

function relativeMinutes(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/** "What your friends are reading" — real-time currently-reading activity from people the user
 * follows (Sprint 9e), replacing the old history-derived "read at some point in the last 48h"
 * version. Each entry either shows a live green dot ("right now") or a relative timestamp,
 * depending on how recently that follow's activity doc was last updated. */
export default function FriendActivity() {
  const { user } = useAuth();
  const [items, setItems] = useState<FollowingActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToFollowingActivity(user.uid, MAX_SHOWN, (res) => {
      setItems(res);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  if (!user) return null;

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-gold" />
        <h3 className="font-syne text-sm font-semibold text-text">What your friends are reading</h3>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="font-noto text-sm text-muted">
          Follow some readers to see who&apos;s reading right now.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const rightNow = Date.now() - new Date(item.lastUpdatedAt).getTime() < RIGHT_NOW_WINDOW_MS;
              return (
                <Link
                  key={item.uid}
                  href={`/reader?id=${encodeURIComponent(item.seriesId)}`}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-bg3"
                >
                  <span className="relative shrink-0">
                    <Avatar uid={item.uid} photoURL={item.photoURL} displayName={item.displayName} size={36} />
                    {rightNow && (
                      <span
                        aria-label="Reading right now"
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-bg2 bg-green-500"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-noto text-xs text-text">
                      <span className="font-semibold">{item.displayName}</span> is reading{" "}
                      <span className="text-gold">{item.seriesTitle}</span>
                    </p>
                    <p className="font-noto text-[11px] text-muted">
                      Chapter {item.chapterTitle} · {rightNow ? "right now" : relativeMinutes(item.lastUpdatedAt)}
                    </p>
                  </div>
                  <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
            loading="lazy"
                      src={proxyImg(item.coverImage)}
                      alt={item.seriesTitle}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          {items.length >= MAX_SHOWN && (
            // No dedicated "everyone I follow's reading activity" page exists yet — the closest
            // real destination is the Following feed tab, so "See more" routes there rather than
            // to a page that doesn't exist.
            <Link
              href="/feed?tab=following"
              className="mt-3 inline-block font-syne text-xs font-semibold text-gold hover:underline"
            >
              See more
            </Link>
          )}
        </>
      )}
    </div>
  );
}
