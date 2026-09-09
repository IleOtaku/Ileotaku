"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import AdSlot from "@/components/ads/AdSlot";
import { useAuth } from "@/hooks/useAuth";

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
  const isPlatinum = profile?.isPlatinum === true;
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
            <AdSlot placement="between-chapters" className="mb-3 h-24 w-full" />
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
