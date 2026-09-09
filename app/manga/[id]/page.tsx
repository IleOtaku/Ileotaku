import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, MessageCircle, Star, Users } from "lucide-react";
import AddToLibraryButton from "@/components/manga/AddToLibraryButton";
import AuthorFollowButton from "@/components/manga/AuthorFollowButton";
import BackToSearchButton from "@/components/manga/BackToSearchButton";
import ChapterList from "@/components/manga/ChapterList";
import LiveChatPreview from "@/components/manga/LiveChatPreview";
import MobileCommentFab from "@/components/manga/MobileCommentFab";
import TipCreatorButton from "@/components/monetisation/TipCreatorButton";
import CommentSection from "@/components/social/CommentSection";
import RatingWidget from "@/components/social/RatingWidget";
import ReportButton from "@/components/social/ReportButton";
import { getMangaStats } from "@/lib/contentLocking";
import { getMangaDetail, getMangaList, proxyImg, type MangaDetailResponse } from "@/lib/manga-api";
import { initials, stringToColor } from "@/lib/utils";

interface MangaPageProps {
  params: { id: string };
  searchParams: { from?: string };
}

export async function generateMetadata({ params }: MangaPageProps): Promise<Metadata> {
  const res = await getMangaDetail(params.id);
  return { title: res.data.title };
}

export default async function MangaPage({ params, searchParams }: MangaPageProps) {
  let detail: MangaDetailResponse["data"] | undefined;
  try {
    const res = await getMangaDetail(params.id);
    detail = res.data;
  } catch {
    notFound();
  }
  if (!detail) {
    notFound();
  }

  // Sprint 9c: engagement-tier chapter locking only applies to real imported catalogs, not the
  // offline fallback demo data — fetched once here rather than per-chapter in ChapterList.
  const isImportedSource = detail.source === "mangadex" || detail.source === "comick" || detail.source === "mangahook";
  const isCreatorWork = detail.source === "creator";
  const stats = isImportedSource ? await getMangaStats(detail.id) : null;

  const chapters = detail.chapterList ?? [];
  const genres = detail.genres ?? [];
  const isManhwa = genres.some((g) => g.toLowerCase() === "manhwa");
  const format = detail.format || (isManhwa ? "Manhwa" : "Manga");
  const contentRating = detail.contentRating || "Teen";
  const language = detail.language || "English";

  const totalReads = chapters.reduce((sum, c) => sum + (Number(c.view) || 0), 0);
  const bookmarkEstimate = Math.max(120, Math.round(totalReads * 0.06));
  const commentEstimate = Math.max(18, Math.round(totalReads * 0.01));

  let related: { id: string; title: string; image: string }[] = [];
  try {
    const relatedRes = await getMangaList(1);
    related = relatedRes.data.mangaList.filter((m) => m.id !== params.id).slice(0, 3);
  } catch {
    related = [];
  }

  return (
    <div>
      <div className="relative h-72 w-full overflow-hidden sm:h-96">
        {/* Above-the-fold hero banner — deliberately not lazy so it's requested immediately. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxyImg(detail.image)} alt={detail.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
          {searchParams.from === "search" ? (
            <BackToSearchButton />
          ) : (
            <Link
              href="/reader"
              className="inline-flex items-center gap-1.5 rounded-full bg-bg/70 px-3 py-1.5 font-noto text-xs font-semibold text-ivory backdrop-blur transition-colors hover:bg-bg/90"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Browse
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="-mt-24 flex flex-col gap-6 sm:-mt-32 sm:flex-row">
          <div className="mx-auto -mt-8 w-40 shrink-0 overflow-hidden rounded-xl border-4 border-bg shadow-2xl sm:mx-0 sm:mt-0 sm:w-52">
            {/* Above-the-fold poster — deliberately not lazy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyImg(detail.image)}
              alt={detail.title}
              className="aspect-[3/4] w-full object-cover"
            />
          </div>

          <div className="flex-1 pt-2 sm:pt-8">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-cinzel text-2xl text-text sm:text-3xl">{detail.title}</h1>
              {isCreatorWork && (
                <span className="badge-plat inline-flex items-center gap-1 whitespace-nowrap">
                  African Original 🌍
                </span>
              )}
            </div>
            {detail.author && <p className="mt-1 font-noto text-sm text-muted">by {detail.author}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {detail.status && (
                <span className="rounded-full bg-green/15 px-2.5 py-1 font-noto text-xs font-semibold text-green2">
                  {detail.status}
                </span>
              )}
              <span className="rounded-full bg-bg3 px-2.5 py-1 font-noto text-xs text-muted">
                {format}
              </span>
              <span className="rounded-full bg-plat/15 px-2.5 py-1 font-noto text-xs font-semibold text-plat2">
                {contentRating}
              </span>
              <span className="rounded-full bg-bg3 px-2.5 py-1 font-noto text-xs text-muted">
                {language}
              </span>
            </div>

            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[11px] text-clay2"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i < 4 ? "fill-gold text-gold" : "fill-bg4 text-bg4"}`}
                />
              ))}
              <span className="font-noto text-sm text-muted">4.2</span>
            </div>

            {detail.description && (
              <details className="group mt-4 max-w-2xl">
                <p className="font-noto text-sm leading-relaxed text-muted line-clamp-4 group-open:hidden">
                  {detail.description}
                </p>
                <p className="hidden font-noto text-sm leading-relaxed text-muted group-open:block">
                  {detail.description}
                </p>
                <summary className="mt-2 inline-block cursor-pointer font-noto text-xs font-semibold text-gold [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Read more</span>
                  <span className="hidden group-open:inline">Show less</span>
                </summary>
              </details>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-5 font-noto text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {totalReads.toLocaleString()} reads
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {bookmarkEstimate.toLocaleString()} bookmarks
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> {commentEstimate.toLocaleString()} comments
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={`/reader?id=${encodeURIComponent(params.id)}`} className="btn-primary">
                Start Reading
              </Link>
              <AddToLibraryButton mangaId={params.id} />
              <ReportButton targetType="series" targetId={params.id} compact />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <RatingWidget seriesId={params.id} />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-10 overflow-x-hidden lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <h2 className="mb-4 font-cinzel text-xl text-text">Chapters</h2>
            <ChapterList
              mangaId={params.id}
              chapters={chapters}
              engagementTier={stats?.engagementTier ?? "low"}
              source={detail.source}
            />

            <div id="comments" className="w-full scroll-mt-20">
              <CommentSection mangaId={params.id} />
            </div>

            <LiveChatPreview mangaId={params.id} />
          </div>

          <div className="flex flex-col gap-6">
            {detail.author && (
              <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
                <p className="mb-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  Creator
                </p>
                {isCreatorWork && detail.authorHandle ? (
                  <Link
                    href={`/creator/${detail.authorHandle}`}
                    className="flex items-center gap-3 transition-opacity hover:opacity-80"
                  >
                    {detail.authorPhotoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
            loading="lazy"
                        src={detail.authorPhotoURL}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-syne text-sm font-bold text-ivory"
                        style={{ backgroundColor: stringToColor(detail.author) }}
                      >
                        {initials(detail.author)}
                      </span>
                    )}
                    <span className="font-syne text-sm font-semibold text-text">{detail.author}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full font-syne text-sm font-bold text-ivory"
                      style={{ backgroundColor: stringToColor(detail.author) }}
                    >
                      {initials(detail.author)}
                    </span>
                    <span className="font-syne text-sm font-semibold text-text">{detail.author}</span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <AuthorFollowButton authorName={detail.author} />
                  <TipCreatorButton
                    creatorId={isCreatorWork ? (detail.authorId ?? null) : null}
                    creatorName={detail.author}
                    mangaId={params.id}
                  />
                </div>
              </div>
            )}

            {related.length > 0 && (
              <div>
                <p className="mb-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  Related Series
                </p>
                <div className="flex flex-col gap-2">
                  {related.map((m) => (
                    <Link
                      key={m.id}
                      href={`/manga/${encodeURIComponent(m.id)}`}
                      className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg2 p-2 transition-colors hover:border-clay"
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-bg3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
            loading="lazy" src={proxyImg(m.image)} alt={m.title} className="h-full w-full object-cover" />
                      </div>
                      <span className="truncate font-noto text-xs text-text">{m.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileCommentFab commentCount={commentEstimate} />
    </div>
  );
}
