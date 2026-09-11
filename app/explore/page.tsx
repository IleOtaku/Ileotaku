import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import EmailSignupForm from "@/components/explore/EmailSignupForm";
import GenreBrowser from "@/components/explore/GenreBrowser";
import SpotlightCreatorLive from "@/components/explore/SpotlightCreatorLive";
import TrendingSoundsSection, { TrendingSoundsEmpty } from "@/components/explore/TrendingSoundsSection";
import Trending from "@/components/landing/Trending";
import Reveal from "@/components/landing/Reveal";
import { SectionEyebrow } from "@/components/ui";
import { proxyImg } from "@/lib/manga-api";
import {
  getAfricanOriginals,
  getFeaturedPublishedSeries,
  getTopRatedPublishedSeries,
  listCreatorProseWorks,
} from "@/lib/publishedSeries";
import { getTrendingSounds } from "@/lib/sounds";
import type { PublishedSeries } from "@/types";

export const metadata: Metadata = {
  title: "Explore",
};

function seriesHref(work: PublishedSeries): string {
  return work.format?.toLowerCase() === "prose" ? `/story/${work.id}` : `/manga/${encodeURIComponent(work.id)}`;
}

function SectionHeader({
  eyebrow,
  title,
  viewAllHref,
}: {
  eyebrow: string;
  title: string;
  viewAllHref?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h2 className="font-cinzel text-2xl text-text sm:text-3xl">{title}</h2>
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="hidden shrink-0 font-syne text-sm text-gold hover:underline sm:block"
        >
          View All →
        </Link>
      )}
    </div>
  );
}

function WorkCardGrid({
  works,
  emptyText,
  accent,
}: {
  works: PublishedSeries[];
  emptyText: string;
  accent?: "plat";
}) {
  if (works.length === 0) {
    return <p className="rounded-2xl border border-dashed border-muted2 p-8 text-center font-noto text-sm text-muted">{emptyText}</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {works.map((work) => (
        <Link
          key={work.id}
          href={seriesHref(work)}
          className={`group overflow-hidden rounded-2xl border bg-bg2 transition-colors hover:border-clay ${
            accent === "plat" ? "border-plat/30" : "border-bg4"
          }`}
        >
          <div className="aspect-[16/9] overflow-hidden bg-bg3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              src={proxyImg(work.coverImage)}
              alt={work.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="p-4">
            {work.format?.toLowerCase() === "prose" && (
              <span className="badge-plat mb-2 inline-flex items-center gap-1 whitespace-nowrap">📖 Prose</span>
            )}
            <p className="truncate font-syne text-base font-semibold text-text">{work.title}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate font-noto text-xs text-muted">
              {work.authorName}
              {work.authorVerified && <BadgeCheck className="h-3 w-3 shrink-0 text-plat" />}
            </p>
            {work.averageRating > 0 && (
              <p className="mt-1 flex items-center gap-1 font-noto text-xs text-gold2">
                <Star className="h-3 w-3 fill-gold text-gold" /> {work.averageRating.toFixed(1)}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default async function ExplorePage() {
  const africanOriginals = await getAfricanOriginals(12);
  const featuredWorks = await getFeaturedPublishedSeries(6);
  const latestProse = await listCreatorProseWorks(6);
  const topRated = await getTopRatedPublishedSeries(6);

  const trendingSounds = await getTrendingSounds(6);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-14 text-center">
        <h1 className="font-cinzel text-3xl text-text sm:text-4xl">Explore ÍléOtaku</h1>
        <p className="mx-auto mt-2 max-w-xl font-noto text-sm text-muted">
          Every corner of the catalog — manga, prose, and the creators building Africa&apos;s next
          big story.
        </p>
      </div>

      {/* African Originals — prominent, top of page */}
      <Reveal>
        <section className="relative mb-16 overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-clay via-bg2 to-gold/20 px-6 py-12 sm:px-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 15% 20%, #f0c96a, transparent 45%), radial-gradient(circle at 85% 80%, #3d6b4f, transparent 45%)",
            }}
          />
          <div className="relative">
            <SectionEyebrow>🌍 African Originals</SectionEyebrow>
            {africanOriginals.length === 0 ? (
              <>
                <h2 className="max-w-xl font-cinzel text-2xl text-ivory sm:text-3xl">
                  Coming Soon — Our creators are uploading now
                </h2>
                <p className="mt-3 max-w-lg font-noto text-sm text-ivory/80">
                  A dedicated home for stories written, drawn and lettered entirely by African
                  creators. Be first to know when the first titles go live.
                </p>
                <div className="mt-6">
                  <EmailSignupForm />
                </div>
              </>
            ) : (
              <>
                <h2 className="max-w-xl font-cinzel text-2xl text-ivory sm:text-3xl">
                  Stories written, drawn and lettered by African creators
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {africanOriginals.map((work) => (
                    <Link
                      key={work.id}
                      href={seriesHref(work)}
                      className="group overflow-hidden rounded-2xl border border-ivory/15 bg-bg/70 backdrop-blur transition-colors hover:border-gold"
                    >
                      <div className="aspect-[16/9] overflow-hidden bg-bg3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          loading="lazy"
                          src={proxyImg(work.coverImage)}
                          alt={work.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-4">
                        <span className="badge-plat mb-2 inline-flex items-center gap-1 whitespace-nowrap">
                          African Original 🌍
                        </span>
                        <p className="truncate font-syne text-base font-semibold text-ivory">
                          {work.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate font-noto text-xs text-ivory/70">
                          {work.authorName}
                          {work.authorVerified && <BadgeCheck className="h-3 w-3 shrink-0 text-plat" />}
                        </p>
                        {work.genres.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {work.genres.slice(0, 3).map((g) => (
                              <span
                                key={g}
                                className="rounded-full bg-ivory/10 px-2 py-0.5 font-noto text-[10px] text-ivory/80"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </Reveal>

      {/* Featured Creator Works */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="⭐ Featured Creator Works" title="Hand-picked by our editors" viewAllHref="/search" />
          <WorkCardGrid works={featuredWorks} emptyText="No featured works yet — check back soon." />
        </section>
      </Reveal>

      {/* Browse by Genre */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="🎭 Browse by Genre" title="Find your next obsession" />
          <GenreBrowser />
        </section>
      </Reveal>

      {/* Latest Prose Stories */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="📖 Latest Prose Stories" title="Text-first tales, chapter by chapter" viewAllHref="/search?tab=works&format=prose" />
          <WorkCardGrid works={latestProse} emptyText="No prose stories published yet — be the first creator to publish one!" accent="plat" />
        </section>
      </Reveal>

      {/* Trending by reads */}
      <Reveal>
        <section className="mb-16">
          <Trending />
        </section>
      </Reveal>

      {/* Top Rated */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="🏆 Top Rated" title="Readers' favorites" viewAllHref="/search?sort=highest-rated" />
          <WorkCardGrid works={topRated} emptyText="No ratings yet — be the first to rate a series." />
        </section>
      </Reveal>

      {/* Spotlight Creator */}
      <Reveal>
        <section>
          <SectionHeader eyebrow="🎨 Spotlight Creator" title="Creator of the week" />
          <SpotlightCreatorLive />
        </section>
      </Reveal>

      {/* Trending Sounds */}
      <Reveal>
        <section className="mt-16">
          <SectionHeader eyebrow="🎵 Trending Sounds" title="What's playing in the Creator Feed" viewAllHref="/feed" />
          {trendingSounds.length === 0 ? (
            <TrendingSoundsEmpty />
          ) : (
            <TrendingSoundsSection sounds={trendingSounds} />
          )}
        </section>
      </Reveal>
    </div>
  );
}
