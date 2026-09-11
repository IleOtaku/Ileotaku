"use client";

import { useEffect, useState } from "react";
import { BookOpen, Bookmark, Eye, MessageCircle } from "lucide-react";
import { subscribeToBookmarkCount } from "@/lib/bookmarks";
import { subscribeToCommentsCount } from "@/lib/firestore";
import { subscribeToChapterCount, subscribeToPublishedSeries } from "@/lib/publishedSeries";

export interface LiveStatsStripProps {
  workId: string;
  /** Server-rendered starting point so the strip never flashes "0" before its listeners
   * connect — each stat is replaced the instant its own onSnapshot fires. */
  initialReads?: number;
  initialChapterCount?: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * The manga detail page's header stat row — reads, bookmarks, comments, and chapter count — all
 * live via onSnapshot rather than the one-time estimates this used to compute from a rough
 * percentage of total reads (see Part 3's spec: "All stats in the header strip update
 * automatically without refresh").
 */
export default function LiveStatsStrip({ workId, initialReads = 0, initialChapterCount = 0 }: LiveStatsStripProps) {
  const [reads, setReads] = useState(initialReads);
  const [chapterCount, setChapterCount] = useState(initialChapterCount);
  const [bookmarks, setBookmarks] = useState(0);
  const [comments, setComments] = useState(0);

  useEffect(() => {
    const unsubs = [
      subscribeToPublishedSeries(workId, (series) => {
        if (series) setReads(series.totalReads ?? 0);
      }),
      subscribeToChapterCount(workId, setChapterCount),
      subscribeToBookmarkCount(workId, setBookmarks),
      subscribeToCommentsCount(workId, setComments),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [workId]);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-5 font-noto text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <Eye className="h-4 w-4" /> {formatCount(reads)} reads
      </span>
      <span className="flex items-center gap-1.5">
        <Bookmark className="h-4 w-4" /> {formatCount(bookmarks)} bookmarks
      </span>
      <span className="flex items-center gap-1.5">
        <MessageCircle className="h-4 w-4" /> {formatCount(comments)} comments
      </span>
      <span className="flex items-center gap-1.5">
        <BookOpen className="h-4 w-4" /> {chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}
      </span>
    </div>
  );
}
