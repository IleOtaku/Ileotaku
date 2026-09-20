"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Loader2, X } from "lucide-react";
import { AD_CONFIG, type AdPurpose } from "@/lib/adConfig";
import { claimAd, startAd, type ClaimResult } from "@/lib/rewardedAds";
import HouseAd from "./HouseAd";

interface RewardedAdModalProps {
  open: boolean;
  purpose: AdPurpose;
  /** For purpose "chapter". */
  target?: { mangaId?: string; chapterId?: string };
  onClose: () => void;
  /** Called once the ad has been watched and counted, with the server's result. */
  onDone: (result: ClaimResult) => void;
  /** Called if the ad couldn't start (limit reached, not signed in, …). */
  onError?: (message: string) => void;
}

type Phase = "starting" | "playing" | "claiming";

/** Full-screen rewarded ad: asks the server to open a session, plays the creative for the ad's full length (no
 * skipping — that's what earns the reward), then asks the server to count it. Closing early forfeits it. */
export default function RewardedAdModal({ open, purpose, target, onClose, onDone, onError }: RewardedAdModalProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    finishedRef.current = false;
    sessionRef.current = null;
    setPhase("starting");
    setElapsed(0);
    setError(null);

    startAd(purpose, target)
      .then(({ sessionId, seconds }) => {
        if (cancelled) return;
        sessionRef.current = sessionId;
        setPhase("playing");
        const startedAt = Date.now();
        timer = setInterval(() => {
          const e = Math.min(seconds, Math.floor((Date.now() - startedAt) / 1000));
          setElapsed(e);
          if (e >= seconds && timer) {
            clearInterval(timer);
            timer = null;
            void finish(sessionId);
          }
        }, 250);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Couldn't start the ad.";
        setError(message);
        onError?.(message);
      });

    async function finish(sessionId: string) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setPhase("claiming");
      // The server's clock decides when the ad is really over; a claim that lands a hair early is retried once.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await claimAd(sessionId);
          if (!cancelled) onDone(result);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Couldn't count that ad.";
          if (attempt < 2 && /finished yet/i.test(message)) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          if (!cancelled) {
            setError(message);
            onError?.(message);
          }
          return;
        }
      }
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // The session is per-open; target/purpose are fixed for that lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const seconds = AD_CONFIG.adSeconds;
  const remaining = Math.max(0, seconds - elapsed);

  return (
    <div data-testid="rewarded-ad" role="dialog" aria-label="Advertisement" className="fixed inset-0 z-[220] flex flex-col items-center justify-center gap-5 bg-black/95 px-6">
      <button type="button" onClick={onClose} aria-label="Close ad" data-testid="rewarded-ad-close" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-ivory hover:bg-white/20">
        <X className="h-4 w-4" />
      </button>

      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="font-noto text-sm text-ivory" data-testid="rewarded-ad-error">{error}</p>
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Close</button>
        </div>
      ) : (
        <>
          <HouseAd elapsed={phase === "playing" ? elapsed : 0} className="h-64 w-full max-w-sm" />
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={elapsed}>
              <div className="h-full rounded-full bg-clay transition-[width] duration-300 ease-linear" style={{ width: `${(elapsed / seconds) * 100}%` }} />
            </div>
            <p className="flex items-center gap-2 font-noto text-xs text-ivory/70" data-testid="rewarded-ad-status">
              {phase === "starting" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading ad…</>)}
              {phase === "playing" && (<><Coins className="h-3.5 w-3.5 text-gold" /> Reward in {remaining}s — watch to the end</>)}
              {phase === "claiming" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting your ad…</>)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
