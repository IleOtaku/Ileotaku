"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import CreatorSection from "@/components/landing/CreatorSection";
import CtaBanner from "@/components/landing/CtaBanner";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Marquee from "@/components/landing/Marquee";
import PricingPreview from "@/components/landing/PricingPreview";
import Reveal from "@/components/landing/Reveal";
import { SectionEyebrow, Skeleton } from "@/components/ui";
import CoinRoulette from "@/components/monetisation/CoinRoulette";
import FriendActivity from "@/components/social/FriendActivity";
import { useAuth } from "@/hooks/useAuth";
import { FALLBACK_SUMMARIES } from "@/lib/fallback-manga";
import { proxyImg } from "@/lib/manga-api";
import { timeOfDayGreeting } from "@/lib/utils";
import type { PublishedSeries } from "@/types";
import ContinueReadingRow from "./ContinueReadingRow";
import CreatorUpdatesSection from "./CreatorUpdatesSection";
import PlatinumUpsellBanner from "./PlatinumUpsellBanner";
import StreakCard from "./StreakCard";

export interface HomeClientProps {
  /** The Trending server component, pre-rendered on the server and passed down as a slot —
   * client components can't import an async Server Component directly, so the page renders
   * it and hands the resolved element down here to use in both the logged-out and feed views. */
  trendingSlot: ReactNode;
  /** Real published creator works, fetched server-side the same way (see app/page.tsx) — falls
   * back to the static "Coming Soon" placeholder rail below only while the catalog is empty. */
  africanOriginals: PublishedSeries[];
}

// Static placeholder rail — only shown while the real catalog (africanOriginals prop) is empty.
const AFRICAN_ORIGINALS_PLACEHOLDER = [
  { title: "Untold: Griot Chronicles", accent: "from-clay to-clay2" },
  { title: "Savanna Skyline", accent: "from-gold to-gold2" },
  { title: "Delta Requiem", accent: "from-green to-green2" },
];

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <Skeleton className="h-9 w-64 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-40 rounded-lg" />
      <div className="mt-10 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-32 shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Home page: full landing pitch when signed out, a personalised feed when signed in. */
export default function HomeClient({ trendingSlot, africanOriginals }: HomeClientProps) {
  const { user, profile, loading } = useAuth();

  // Never flash the wrong state — hold a skeleton until Firebase auth has resolved.
  if (loading) {
    return <HomeSkeleton />;
  }

  if (!user) {
    return (
      <>
        <Hero />
        <Marquee />
        {trendingSlot}
        <HowItWorks />
        <CreatorSection />
        <PricingPreview />
        <CtaBanner />
      </>
    );
  }

  const name = profile?.displayName ?? user.displayName ?? "Reader";
  const greeting = timeOfDayGreeting();
  const readingList = profile?.readingList ?? [];
  const isPlatinum = profile?.isPlatinum === true;

  const editorsPicks = FALLBACK_SUMMARIES.slice(0, 3);
  const newReleases = [...FALLBACK_SUMMARIES].reverse();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Reveal>
        <h1 className="font-cinzel text-3xl text-text">
          {greeting}, <span className="text-gold">{name}</span>
        </h1>
        <p className="mt-1 font-noto text-sm text-muted">Here&apos;s what&apos;s waiting for you today.</p>
      </Reveal>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <SectionEyebrow>Continue Reading</SectionEyebrow>
          <Link href="/profile" className="font-syne text-xs text-gold hover:underline">
            View All
          </Link>
        </div>
        <ContinueReadingRow mangaIds={readingList} />
      </section>

      <Reveal>
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <SectionEyebrow>Creator Updates</SectionEyebrow>
            <Link href="/feed" className="font-syne text-xs text-gold hover:underline">
              View All
            </Link>
          </div>
          <CreatorUpdatesSection />
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14 grid gap-6 sm:grid-cols-2">
          <div>
            <SectionEyebrow>Daily Spin</SectionEyebrow>
            <CoinRoulette />
          </div>
          <div>
            <SectionEyebrow>Keep Your Streak</SectionEyebrow>
            <StreakCard />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14">
          <SectionEyebrow>Friend Activity</SectionEyebrow>
          <FriendActivity />
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <SectionEyebrow>Trending Today</SectionEyebrow>
            <Link href="/explore" className="font-syne text-xs text-gold hover:underline">
              View All
            </Link>
          </div>
          {trendingSlot}
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <SectionEyebrow>African Originals</SectionEyebrow>
            <Link href="/explore" className="font-syne text-xs text-gold hover:underline">
              View All
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {africanOriginals.length > 0
              ? africanOriginals.map((work) => (
                  <Link
                    key={work.id}
                    href={`/manga/${encodeURIComponent(work.id)}`}
                    className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl bg-bg3 p-4"
                  >
                    {work.coverImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
            loading="lazy"
                        src={proxyImg(work.coverImage)}
                        alt={work.title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
                    <span className="badge-plat absolute right-3 top-3 whitespace-nowrap">
                      African Original 🌍
                    </span>
                    <p className="relative font-cinzel text-sm text-ivory drop-shadow">{work.title}</p>
                  </Link>
                ))
              : AFRICAN_ORIGINALS_PLACEHOLDER.map((item) => (
                  <div
                    key={item.title}
                    className={`relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br p-4 ${item.accent}`}
                  >
                    <span className="absolute right-3 top-3 rounded-full bg-bg/70 px-2.5 py-1 font-syne text-[10px] font-bold uppercase tracking-wide text-ivory">
                      Coming Soon
                    </span>
                    <p className="font-cinzel text-sm text-ivory drop-shadow">{item.title}</p>
                  </div>
                ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <SectionEyebrow>Editor&apos;s Picks</SectionEyebrow>
            <Link href="/explore" className="font-syne text-xs text-gold hover:underline">
              View All
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {editorsPicks.map((item) => (
              <Link
                key={item.id}
                href={`/manga/${encodeURIComponent(item.id)}`}
                className="group overflow-hidden rounded-2xl border border-bg4 bg-bg2"
              >
                <div className="aspect-[16/9] overflow-hidden bg-bg3">
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
                  <p className="mt-1 line-clamp-2 font-noto text-xs text-muted">
                    by {item.author} · {item.genres.join(", ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <SectionEyebrow>New Releases</SectionEyebrow>
            <Link href="/explore" className="font-syne text-xs text-gold hover:underline">
              View All
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {newReleases.map((item) => (
              <Link
                key={item.id}
                href={`/manga/${encodeURIComponent(item.id)}`}
                className="group w-32 shrink-0"
              >
                <div className="aspect-[3/4] w-32 overflow-hidden rounded-xl border border-bg4 bg-bg2">
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
        </section>
      </Reveal>

      {!isPlatinum && (
        <Reveal>
          <div className="mt-14">
            <PlatinumUpsellBanner />
          </div>
        </Reveal>
      )}
    </div>
  );
}
