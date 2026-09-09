"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import DownloadsSection from "@/components/profile/DownloadsSection";
import { EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useMangaSummaries } from "@/hooks/useMangaSummaries";
import { proxyImg } from "@/lib/manga-api";

/** Currently Reading (real per-manga progress) plus a Bookmarked grid fetched from readingList. */
export default function LibraryTab() {
  const { profile } = useAuth();
  const readingProgress = profile?.readingProgress ?? {};
  // Most-recently-updated entry is "the one you're actively reading" — it gets the Now Reading badge.
  const currentlyReading = Object.entries(readingProgress).sort((a, b) =>
    (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? "")
  );
  const nowReadingId = currentlyReading[0]?.[0];
  const readingList = profile?.readingList ?? [];
  const { items: bookmarked, loading } = useMangaSummaries(readingList);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Currently Reading</h3>
        {currentlyReading.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6 text-muted" />}
            title="Nothing in progress"
            description="Start a series and your progress will show up here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {currentlyReading.map(([mangaId, entry]) => (
              <div key={mangaId} className="group relative">
                {mangaId === nowReadingId && (
                  <Link
                    href={`/reader?id=${encodeURIComponent(mangaId)}&chapter=${entry.chapterIndex}`}
                    className="absolute left-1.5 top-1.5 z-10 flex animate-pulse items-center gap-1 rounded-full bg-clay px-2 py-0.5 font-syne text-[10px] font-bold text-ivory shadow-lg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-ivory" />
                    Now Reading
                  </Link>
                )}
                <Link href={`/manga/${encodeURIComponent(mangaId)}`}>
                  <div className="aspect-[3/4] overflow-hidden rounded-xl border border-bg4 bg-bg2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
            loading="lazy"
                      src={proxyImg(entry.coverURL)}
                      alt={entry.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg4">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-clay to-gold"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 truncate font-syne text-xs font-semibold text-text">
                    {entry.title}
                  </p>
                  <p className="truncate font-noto text-[11px] text-muted">{entry.chapterLabel}</p>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Bookmarked</h3>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : bookmarked.length === 0 ? (
          <EmptyState
            icon={<span className="text-4xl">📚</span>}
            title="Your Library is Empty"
            description="Start reading to add titles here."
            action={
              <Link href="/reader" className="btn-primary">
                Browse Manga
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {bookmarked.map((item) => (
              <Link key={item.id} href={`/manga/${encodeURIComponent(item.id)}`} className="group">
                <div className="aspect-[3/4] overflow-hidden rounded-xl border border-bg4 bg-bg2">
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
        )}
      </div>

      <DownloadsSection />
    </div>
  );
}
