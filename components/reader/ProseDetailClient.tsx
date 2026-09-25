"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Lock, Sparkles, Star } from "lucide-react";
import PublishedWorkCard from "@/components/creator/PublishedWorkCard";
import LiveStatsStrip from "@/components/manga/LiveStatsStrip";
import TipCreatorButton from "@/components/monetisation/TipCreatorButton";
import CommentSection from "@/components/social/CommentSection";
import FollowButton from "@/components/social/FollowButton";
import RatingWidget from "@/components/social/RatingWidget";
import ReportButton from "@/components/social/ReportButton";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { subscribeToRatings } from "@/lib/firestore";
import {
  getPublishedSeries,
  listCreatorProseWorks,
  subscribeToSeriesChapters,
} from "@/lib/publishedSeries";
import type { PublishedChapter, PublishedSeries } from "@/types";

export interface ProseDetailClientProps {
  workId: string;
}

/** Star-and-average row, live — same pattern as MangaDetailClient's own HeaderRatingRow. */
function HeaderRatingRow({ seriesId }: { seriesId: string }) {
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    return subscribeToRatings(seriesId, (ratings) => {
      setCount(ratings.length);
      setAverage(ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0);
    });
  }, [seriesId]);

  return (
    <div className="mt-3 flex items-center gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < Math.round(average) ? "fill-gold text-gold" : "fill-bg4 text-bg4"}`} />
      ))}
      <span className="font-noto text-sm text-muted">
        {count > 0 ? `${average.toFixed(1)} (${count.toLocaleString()})` : "No ratings yet"}
      </span>
    </div>
  );
}

function ChapterRow({ workId, chapter, index }: { workId: string; chapter: PublishedChapter; index: number }) {
  const locked = chapter.coinPrice > 0;
  return (
    <Link
      href={`/story/${workId}/read/${index + 1}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-bg4 bg-bg2 px-4 py-3 transition-colors hover:border-clay"
    >
      <div className="min-w-0">
        <p className="truncate font-syne text-sm font-semibold text-text">
          Chapter {chapter.chapterNumber}
          {chapter.title ? ` — ${chapter.title}` : ""}
        </p>
        <p className="mt-0.5 font-noto text-xs text-muted">
          {(chapter.wordCount ?? 0).toLocaleString()} words ·{" "}
          {new Date(chapter.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>
      {locked ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-clay/15 px-2.5 py-1 font-noto text-xs font-semibold text-clay2">
          <Lock className="h-3 w-3" /> {chapter.coinPrice} 🪙
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-green/15 px-2.5 py-1 font-noto text-xs font-semibold text-green2">Free</span>
      )}
    </Link>
  );
}

/**
 * Prose work details/landing page — mirrors components/manga/MangaDetailClient.tsx's layout
 * (hero, stats, chapter list, comments, related works), adapted for prose's text-based chapters
 * (word count + lock icon instead of a page thumbnail) and a richer author card (follow + tip,
 * which the manga page doesn't show at all since imported manga has no real author account).
 * Beta feedback: "Mangas have a page that shows manga details... proses dont, fix that."
 */
export default function ProseDetailClient({ workId }: ProseDetailClientProps) {
  const [series, setSeries] = useState<PublishedSeries | null | undefined>(undefined);
  const [chapters, setChapters] = useState<PublishedChapter[]>([]);
  const [related, setRelated] = useState<PublishedSeries[]>([]);

  useEffect(() => {
    let cancelled = false;
    getPublishedSeries(workId).then((s) => {
      if (!cancelled) setSeries(s);
    });
    const unsub = subscribeToSeriesChapters(workId, (c) => {
      if (!cancelled) setChapters(c);
    });
    listCreatorProseWorks(8)
      .then((works) => {
        if (!cancelled) setRelated(works.filter((w) => w.id !== workId).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsub();
    };
  }, [workId]);

  if (series === null) notFound();

  if (series === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <Skeleton className="h-72 w-full rounded-2xl sm:h-96" />
        <div className="mt-8 flex flex-col gap-6 sm:flex-row">
          <Skeleton className="mx-auto h-56 w-40 shrink-0 rounded-xl sm:mx-0 sm:h-72 sm:w-52" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-72 w-full overflow-hidden sm:h-96">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={getOptimizedImageUrl(series.coverImage, 1200)} alt={series.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="-mt-24 flex flex-col gap-6 sm:-mt-32 sm:flex-row">
          <div className="mx-auto -mt-8 w-40 shrink-0 overflow-hidden rounded-xl border-4 border-bg shadow-2xl sm:mx-0 sm:mt-0 sm:w-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getOptimizedImageUrl(series.coverImage, 600)} alt={series.title} className="aspect-[3/4] w-full object-cover" />
          </div>

          <div className="flex-1 pt-2 sm:pt-8">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-cinzel text-2xl text-gold sm:text-3xl">{series.title}</h1>
              <span className="badge-plat inline-flex items-center gap-1 whitespace-nowrap">
                <Sparkles className="h-3.5 w-3.5" /> African Original 🌍
              </span>
            </div>
            {series.authorName && <p className="mt-1 font-noto text-sm text-muted">by {series.authorName}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-bg3 px-2.5 py-1 font-noto text-xs text-muted">Prose</span>
              <span className="rounded-full bg-plat/15 px-2.5 py-1 font-noto text-xs font-semibold text-plat2">
                {series.contentRating || "Teen"}
              </span>
              <span className="rounded-full bg-bg3 px-2.5 py-1 font-noto text-xs text-muted">{series.language || "English"}</span>
            </div>

            {series.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {series.genres.map((g) => (
                  <span key={g} className="rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[11px] text-clay2">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <HeaderRatingRow seriesId={workId} />

            {series.description && (
              <details className="group mt-4 max-w-2xl">
                <p className="font-noto text-sm leading-relaxed text-muted line-clamp-4 group-open:hidden">{series.description}</p>
                <p className="hidden font-noto text-sm leading-relaxed text-muted group-open:block">{series.description}</p>
                <summary className="mt-2 inline-block cursor-pointer font-noto text-xs font-semibold text-gold [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Read more</span>
                  <span className="hidden group-open:inline">Show less</span>
                </summary>
              </details>
            )}

            <LiveStatsStrip workId={workId} initialReads={series.totalReads} initialChapterCount={series.chapterCount} />
            {!!series.totalWordCount && (
              <p className="mt-2 flex items-center gap-1.5 font-noto text-xs text-muted">
                <BookOpen className="h-3.5 w-3.5" /> {series.totalWordCount.toLocaleString()} words total
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={`/story/${workId}/read/1`} className="btn-primary">
                Start Reading
              </Link>
              <ReportButton targetType="series" targetId={workId} compact />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <RatingWidget seriesId={workId} />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-10 overflow-x-hidden lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <h2 className="mb-4 font-cinzel text-xl text-text">Chapters</h2>
            {chapters.length === 0 ? (
              <p className="font-noto text-sm text-muted">No chapters published yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {chapters.map((c, i) => (
                  <ChapterRow key={c.id} workId={workId} chapter={c} index={i} />
                ))}
              </div>
            )}

            <div id="comments" className="mt-10 w-full scroll-mt-20">
              <CommentSection mangaId={workId} />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <p className="mb-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Author</p>
              {series.authorHandle ? (
                <Link href={`/creator/${series.authorHandle}`} className="flex items-center gap-3 transition-opacity hover:opacity-80">
                  <Avatar uid={series.authorId} photoURL={series.authorPhotoURL} displayName={series.authorName} size={40} />
                  <span className="flex items-center gap-1 font-syne text-sm font-semibold text-text">
                    {series.authorName}
                    <VerificationBadge user={{ isVerified: series.authorVerified, verifiedType: series.authorVerifiedType }} size={14} />
                  </span>
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar uid={series.authorId} photoURL={series.authorPhotoURL} displayName={series.authorName} size={40} />
                  <span className="font-syne text-sm font-semibold text-text">{series.authorName}</span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <FollowButton targetUid={series.authorId} hideCount />
                <TipCreatorButton creatorId={series.authorId} creatorName={series.authorName} mangaId={workId} />
              </div>
            </div>

            {related.length > 0 && (
              <div>
                <p className="mb-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">More Prose</p>
                <div className="flex flex-col gap-3">
                  {related.map((w) => (
                    <PublishedWorkCard key={w.id} work={w} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
