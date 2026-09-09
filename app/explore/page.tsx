import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Globe2, Sparkles, TrendingUp, UserPlus } from "lucide-react";
import EmailSignupForm from "@/components/explore/EmailSignupForm";
import GenreBrowser from "@/components/explore/GenreBrowser";
import NewReleasesLive from "@/components/explore/NewReleasesLive";
import PlatinumExclusivesLive from "@/components/explore/PlatinumExclusivesLive";
import TrendingSoundsSection, { TrendingSoundsEmpty } from "@/components/explore/TrendingSoundsSection";
import Trending from "@/components/landing/Trending";
import Reveal from "@/components/landing/Reveal";
import { SectionEyebrow } from "@/components/ui";
import { getMangaIdsByTier } from "@/lib/contentLocking";
import { FALLBACK_SUMMARIES } from "@/lib/fallback-manga";
import { proxyImg } from "@/lib/manga-api";
import { getAfricanOriginals } from "@/lib/publishedSeries";
import { getTrendingSounds } from "@/lib/sounds";
import { initials, parseViewCount, stringToColor } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Explore",
};

const RANK_COLORS = ["#d4a843", "#c8c8d2", "#c4622d"];
const LANGUAGE_COLUMNS = [
  { flag: "🇫🇷", name: "French Picks" },
  { flag: "🇳🇬", name: "Yorùbá Picks" },
  { flag: "🇰🇪", name: "Swahili Picks" },
];

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

export default async function ExplorePage() {
  const hallOfFame = [...FALLBACK_SUMMARIES]
    .sort((a, b) => parseViewCount(b.views) - parseViewCount(a.views))
    .slice(0, 3);

  const rising = FALLBACK_SUMMARIES.slice(0, 4).map((item, i) => ({
    ...item,
    trend: [18, 12, 27, 9][i],
  }));

  const editorsPicks = FALLBACK_SUMMARIES.slice(0, 3);

  // Sprint 9c: real high/viral-tier titles — the ids themselves come from Firestore (unaffected
  // by the MangaDex IP block, so this stays server-side), resolved against the live New Releases
  // pool client-side by PlatinumExclusivesLive below (see its own comment for why).
  const highViralIds = await getMangaIdsByTier(["high", "viral"], 6);

  const spotlight = FALLBACK_SUMMARIES[1];
  const trendingSounds = await getTrendingSounds(6);
  const africanOriginals = await getAfricanOriginals(12);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-14 text-center">
        <h1 className="font-cinzel text-3xl text-text sm:text-4xl">Explore ÍléOtaku</h1>
        <p className="mx-auto mt-2 max-w-xl font-noto text-sm text-muted">
          Every corner of the catalog — trending series, hidden gems, and the creators building
          Africa&apos;s next big story.
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
                      href={`/manga/${encodeURIComponent(work.id)}`}
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

      {/* Trending Today */}
      <Reveal>
        <section className="mb-16">
          <Trending />
        </section>
      </Reveal>

      {/* Editor's Picks */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="⭐ Editor's Picks" title="Hand-picked for you" viewAllHref="/search" />
          <div className="grid gap-6 sm:grid-cols-3">
            {editorsPicks.map((item) => (
              <Link
                key={item.id}
                href={`/manga/${encodeURIComponent(item.id)}`}
                className="group overflow-hidden rounded-2xl border border-bg4 bg-bg2"
              >
                <div className="aspect-[16/10] overflow-hidden bg-bg3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy"
                    src={proxyImg(item.image)}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <p className="font-syne text-base font-semibold text-text">{item.title}</p>
                  <p className="mt-1.5 line-clamp-2 font-noto text-xs text-muted">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* New Releases */}
      <Reveal>
        <section id="new-releases" className="mb-16 scroll-mt-24">
          <SectionHeader eyebrow="🆕 New Releases" title="Fresh off the press" viewAllHref="/search?sort=newest" />
          <NewReleasesLive />
        </section>
      </Reveal>

      {/* Browse by Genre */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="🎭 Browse by Genre" title="Find your next obsession" />
          <GenreBrowser />
        </section>
      </Reveal>

      {/* Rising */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="📈 Rising" title="Climbing the charts" viewAllHref="/search?sort=most-read" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rising.map((item) => (
              <Link
                key={item.id}
                href={`/manga/${encodeURIComponent(item.id)}`}
                className="group relative overflow-hidden rounded-xl border border-bg4 bg-bg2"
              >
                <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-green/90 px-2 py-1 font-syne text-[10px] font-bold text-ivory">
                  <TrendingUp className="h-3 w-3" /> +{item.trend}%
                </span>
                <div className="aspect-[3/4] overflow-hidden bg-bg3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy"
                    src={proxyImg(item.image)}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="truncate p-2 font-syne text-xs font-semibold text-text">{item.title}</p>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Hall of Fame */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="🏆 Hall of Fame" title="All-time greats" viewAllHref="/search?sort=highest-rated" />
          <div className="grid gap-6 sm:grid-cols-3">
            {hallOfFame.map((item, i) => (
              <Link
                key={item.id}
                href={`/manga/${encodeURIComponent(item.id)}`}
                className="group relative overflow-hidden rounded-2xl border border-bg4 bg-bg2"
              >
                <span
                  className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full font-cinzel text-sm font-bold text-bg shadow-lg"
                  style={{ backgroundColor: RANK_COLORS[i] }}
                >
                  {i + 1}
                </span>
                <div className="aspect-[3/4] overflow-hidden bg-bg3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy"
                    src={proxyImg(item.image)}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="font-syne text-sm font-semibold text-text">{item.title}</p>
                  <p className="mt-1 font-noto text-xs text-muted">{item.views} views</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* By Language */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="🌐 By Language" title="Read in your language" />
          <div className="grid gap-6 sm:grid-cols-3">
            {LANGUAGE_COLUMNS.map((col) => (
              <div key={col.name}>
                <p className="mb-3 flex items-center gap-2 font-syne text-sm font-semibold text-text">
                  <span className="text-lg">{col.flag}</span> {col.name}
                </p>
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-dashed border-muted2 bg-bg2 p-2.5"
                    >
                      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-bg3 text-lg">
                        {col.flag}
                      </div>
                      <div>
                        <p className="font-noto text-xs text-muted">Title coming soon</p>
                        <span className="mt-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 font-syne text-[10px] font-semibold text-gold">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Platinum Exclusives */}
      <Reveal>
        <section className="mb-16">
          <SectionHeader eyebrow="💎 Platinum Exclusives" title="Read it before anyone else" />
          <PlatinumExclusivesLive highViralIds={highViralIds} />
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-plat/30 bg-plat/5 p-6 text-center">
            <p className="font-syne text-sm font-semibold text-text">
              Get Platinum to access early chapters
            </p>
            <Link href="/pricing" className="btn-plat">
              <Sparkles className="h-4 w-4" /> Go Platinum
            </Link>
          </div>
        </section>
      </Reveal>

      {/* Spotlight Creator */}
      <Reveal>
        <section>
          <SectionHeader eyebrow="🎨 Spotlight Creator" title="Creator of the week" />
          <div className="grid gap-6 rounded-2xl border border-bg4 bg-bg2 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-cinzel text-xl font-bold text-ivory"
              style={{ backgroundColor: stringToColor(spotlight.author) }}
            >
              {initials(spotlight.author)}
            </span>
            <div>
              <p className="flex items-center gap-2 font-syne text-base font-semibold text-text">
                {spotlight.author}
                <span className="rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-clay2">
                  <Globe2 className="mr-1 inline h-3 w-3" /> West Africa
                </span>
              </p>
              <p className="mt-1 max-w-md font-noto text-xs text-muted">
                Creator of <span className="text-gold">{spotlight.title}</span> — building worlds
                where African folklore meets the far future.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-14 w-10 overflow-hidden rounded bg-bg3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy"
                    src={proxyImg(spotlight.image)}
                    alt={spotlight.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="font-noto text-xs text-muted">{spotlight.title}</span>
              </div>
            </div>
            <button type="button" className="btn-primary shrink-0">
              <UserPlus className="h-4 w-4" /> Follow
            </button>
          </div>
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
