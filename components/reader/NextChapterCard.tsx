"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import AdSlot from "@/components/ads/AdSlot";
import { useAuth } from "@/hooks/useAuth";
import { isAdsFree } from "@/lib/ads";

export interface NextChapterCardProps {
  onNext: () => void;
}

/**
 * Shown as an overlay once the reader scrolls within 95% of the bottom of a chapter (see
 * ReaderPages' onProgressChange, wired up in ReaderClient). Free readers see a between-chapters
 * ad and a 5-second countdown before auto-advancing; Platinum readers (AdSlot renders null for
 * them) see the "Next Chapter" button immediately, with no delay at all.
 */
export default function NextChapterCard({ onNext }: NextChapterCardProps) {
  const { profile } = useAuth();
  // Beta feedback: "Allow free users to buy 1hr ads free with coins" — during a purchased
  // ads-free window this card should behave exactly like it does for a real Platinum reader.
  const isPlatinum = isAdsFree(profile);
  const [secondsLeft, setSecondsLeft] = useState(isPlatinum ? 0 : 5);

  useEffect(() => {
    if (isPlatinum || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [isPlatinum, secondsLeft]);

  useEffect(() => {
    if (!isPlatinum && secondsLeft === 0) onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isPlatinum]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-bg4 bg-bg2 p-4 shadow-2xl">
        {!isPlatinum && (
          <>
            <p className="mb-3 text-center font-cinzel text-sm text-text">Continue to next chapter</p>
            <div className="relative mb-3">
              <AdSlot placement="between-chapters" className="h-24 w-full" />
              {/* Beta feedback / ads overhaul: "The AdSlot between chapters must have a visible
                  close/skip button after 5 seconds." The "Next Chapter" button below was already
                  clickable immediately (never actually gated on the countdown), but this puts an
                  explicit skip control directly on the ad itself once the 5s mark passes, rather
                  than relying on a reader to notice the whole card was already skippable. */}
              {secondsLeft === 0 && (
                <button
                  type="button"
                  onClick={onNext}
                  aria-label="Skip ad"
                  className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-bg/80 px-2 py-1 font-noto text-[10px] font-semibold text-text backdrop-blur hover:bg-bg"
                >
                  Skip <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </>
        )}
        <button type="button" onClick={onNext} className="btn-primary w-full">
          Next Chapter <ArrowRight className="h-4 w-4" />
          {!isPlatinum && secondsLeft > 0 && (
            <span className="font-noto text-xs opacity-80">({secondsLeft}s)</span>
          )}
        </button>
      </div>
    </div>
  );
}
