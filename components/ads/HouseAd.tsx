"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * ÍléOtaku's own ad creatives. Until third-party advertisers are signed up, the ad inventory is our own promos
 * — video-style animated slides (no popups, no redirects, nothing that leaves the page), used by the rewarded-ad
 * player and the between-chapters banner. When an ad network is wired in later, its creative just replaces
 * this component inside the same frames.
 */
const SLIDES = [
  { emoji: "💎", title: "Go Platinum", body: "No ads, every chapter unlocked, HD posting and more — from ₦200 an hour.", href: "/pricing", cta: "See Platinum" },
  { emoji: "🎬", title: "Post to the feed", body: "Everyone can post. Verified creators reach the whole community.", href: "/feed", cta: "Open the feed" },
  { emoji: "🪙", title: "Support your creators", body: "Tip your favourite series with coins and help the next chapter arrive faster.", href: "/pricing", cta: "Get coins" },
  { emoji: "🎧", title: "Call your friends", body: "Group voice calls in any chat — up to six people, right in ÍléOtaku.", href: "/messages", cta: "Open messages" },
] as const;

/** A rotating promo card. `elapsed` (seconds) drives which slide shows, so the rewarded player's countdown and
 * the creative stay in step; without it the slides advance on their own every 5 seconds. */
export default function HouseAd({ elapsed, className = "", linkable = false }: { elapsed?: number; className?: string; linkable?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (elapsed !== undefined) return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [elapsed]);
  const index = Math.floor((elapsed ?? tick * 5) / 5) % SLIDES.length;
  const slide = SLIDES[index];

  return (
    <div
      data-testid="house-ad"
      data-slide={index}
      className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-clay/25 via-bg3 to-plat/20 p-5 text-center ${className}`}
    >
      <span className="absolute left-2.5 top-2 rounded bg-black/50 px-1.5 py-0.5 font-noto text-[9px] font-semibold uppercase tracking-wide text-ivory/70">Ad</span>
      <span key={index} className="animate-pulse text-4xl">{slide.emoji}</span>
      <p className="font-cinzel text-lg text-ivory">{slide.title}</p>
      <p className="max-w-xs font-noto text-xs text-ivory/70">{slide.body}</p>
      {linkable && (
        <Link href={slide.href} className="mt-1 rounded-full bg-white/10 px-3 py-1 font-noto text-[11px] font-semibold text-ivory hover:bg-white/20">
          {slide.cta}
        </Link>
      )}
    </div>
  );
}
