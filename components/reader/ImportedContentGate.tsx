"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, Loader2, Lock, SkipForward, Sparkles } from "lucide-react";
import {
  getLockConfig,
  isChapterUnlocked,
  unlockChapterWithAd,
  unlockChapterWithCoins,
  type LockConfig,
} from "@/lib/contentLocking";
import { proxyImg } from "@/lib/manga-api";
import type { UserProfile } from "@/types";

/** Total simulated-ad length, and how far into it "Skip Ad" becomes available — mirrors the
 * familiar skippable-preroll pattern (YouTube etc.): the button appears after 5s of *watching*,
 * not when 5s remain. */
const AD_SECONDS = 30;
const SKIP_AFTER_SECONDS = 5;

export interface ImportedContentGateProps {
  mangaId: string;
  chapterId: string;
  /** 0-based — chapters 1-7 (index 0-6) are always free, per getLockConfig(). */
  chapterIndex: number;
  /** The manga's ContentSource ("creator", or the legacy "african" alias getLockConfig() still
   * treats the same way). */
  source: string | undefined;
  /** Only meaningful when source is "creator"/"african" — that specific chapter's own author-set
   * coin price (see ReaderClient, which reads it off the chapter's MangaChapterSummary). */
  creatorChapterCoinPrice?: number;
  userProfile: UserProfile | null;
  mangaTitle: string;
  chapterLabel: string;
  /** First page's image URL, used only as the coin-gate's blurred backdrop — never rendered
   * full-resolution/unblurred until the chapter is actually unlocked (that happens via
   * `children`, not this component). */
  firstPageUrl?: string;
  children: ReactNode;
}

type GateState =
  | { status: "checking" }
  | { status: "open" }
  | { status: "ad"; config: LockConfig }
  | { status: "coins"; config: LockConfig };

/**
 * Gates one chapter of a creator-published work behind its own author-set coin price (see
 * lib/contentLocking.ts's getLockConfig()). Renders `children` (the actual reader) untouched
 * whenever the chapter is free, Platinum-bypassed, or already unlocked; otherwise replaces it
 * with an ad-watch or coin-purchase overlay until the reader clears one of those.
 */
export default function ImportedContentGate({
  mangaId,
  chapterId,
  chapterIndex,
  source,
  creatorChapterCoinPrice,
  userProfile,
  mangaTitle,
  chapterLabel,
  firstPageUrl,
  children,
}: ImportedContentGateProps) {
  const [state, setState] = useState<GateState>({ status: "checking" });
  const [balance, setBalance] = useState(userProfile?.coins ?? 0);

  useEffect(() => {
    setBalance(userProfile?.coins ?? 0);
  }, [userProfile?.coins]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "checking" });

    (async () => {
      const config = await getLockConfig(mangaId, chapterIndex, source, userProfile, creatorChapterCoinPrice);
      if (cancelled) return;

      if (!config.locked) {
        setState({ status: "open" });
        return;
      }
      if (userProfile?.uid) {
        const already = await isChapterUnlocked(userProfile.uid, chapterId);
        if (cancelled) return;
        if (already) {
          setState({ status: "open" });
          return;
        }
      }
      setState(config.reason === "ad" ? { status: "ad", config } : { status: "coins", config });
    })();

    return () => {
      cancelled = true;
    };
  }, [mangaId, chapterId, chapterIndex, source, userProfile, creatorChapterCoinPrice]);

  if (state.status === "checking") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="font-noto text-sm text-muted">Checking chapter access...</p>
      </div>
    );
  }

  if (state.status === "open") {
    return <>{children}</>;
  }

  if (state.status === "ad") {
    return (
      <AdGate
        mangaTitle={mangaTitle}
        chapterLabel={chapterLabel}
        onUnlocked={async () => {
          if (userProfile?.uid) await unlockChapterWithAd(userProfile.uid, mangaId, chapterId);
          setState({ status: "open" });
        }}
      >
        {children}
      </AdGate>
    );
  }

  return (
    <CoinGate
      chapterLabel={chapterLabel}
      coinPrice={state.config.coinPrice ?? 0}
      balance={balance}
      firstPageUrl={firstPageUrl}
      onUnlock={async () => {
        if (!userProfile?.uid) return { success: false, message: "Sign in to unlock this chapter." };
        const result = await unlockChapterWithCoins(userProfile.uid, mangaId, chapterId, state.config.coinPrice ?? 0);
        if (result.success) {
          setBalance((b) => b - (state.config.coinPrice ?? 0));
          setState({ status: "open" });
        }
        return result;
      }}
    >
      {children}
    </CoinGate>
  );
}

/* ---------------------------- Ad gate ---------------------------- */

function AdGate({
  mangaTitle,
  chapterLabel,
  onUnlocked,
  children,
}: {
  mangaTitle: string;
  chapterLabel: string;
  onUnlocked: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [secondsLeft, setSecondsLeft] = useState(AD_SECONDS);
  const [finishing, setFinishing] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !finishing) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  async function finish() {
    if (timerRef.current) clearInterval(timerRef.current);
    setFinishing(true);
    await onUnlocked();
    setFading(true);
  }

  const watched = AD_SECONDS - secondsLeft;
  const canSkip = watched >= SKIP_AFTER_SECONDS;
  const progressPct = (watched / AD_SECONDS) * 100;

  return (
    <div className="relative flex flex-1 overflow-hidden bg-bg">
      <AnimatePresence>
        {!fading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black px-6 text-center"
          >
            <div>
              <p className="font-cinzel text-lg tracking-wide text-gold">ÍléOtaku</p>
              <p className="mt-1 font-noto text-xs text-ivory/70">{mangaTitle}</p>
            </div>

            <h2 className="font-cinzel text-xl text-ivory">Watch a short ad to unlock this chapter</h2>

            <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
              <span className="text-4xl">📺</span>
              <p className="font-syne text-3xl font-bold text-ivory">
                {finishing ? "Unlocking..." : secondsLeft}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-clay transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {canSkip && !finishing && (
                <button
                  type="button"
                  onClick={finish}
                  className="mt-1 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 font-noto text-xs font-semibold text-ivory hover:bg-white/20"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Skip Ad
                </button>
              )}
            </div>

            <Link
              href="/pricing"
              className="flex items-center gap-1.5 font-noto text-xs font-semibold text-plat2 hover:underline"
            >
              Or go Platinum for unlimited reading 💎
            </Link>

            <p className="max-w-xs font-noto text-[11px] text-ivory/40">Reading {chapterLabel}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}

/* ---------------------------- Coin gate ---------------------------- */

function CoinGate({
  chapterLabel,
  coinPrice,
  balance,
  firstPageUrl,
  onUnlock,
  children,
}: {
  chapterLabel: string;
  coinPrice: number;
  balance: number;
  firstPageUrl?: string;
  onUnlock: () => Promise<{ success: boolean; message?: string }>;
  children: ReactNode;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const [insufficient, setInsufficient] = useState(false);
  const [open, setOpen] = useState(true);

  async function handleUnlock() {
    setUnlocking(true);
    setInsufficient(false);
    try {
      const result = await onUnlock();
      if (!result.success) {
        setInsufficient(true);
      } else {
        setOpen(false);
      }
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="relative flex flex-1 overflow-hidden bg-bg">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-10 flex items-center justify-center px-6"
          >
            {firstPageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
            loading="lazy"
                src={proxyImg(firstPageUrl)}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover"
                style={{ filter: "blur(12px)" }}
              />
            )}
            <div className="absolute inset-0 bg-bg/75" />

            <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-bg4 bg-bg2/95 p-6 text-center shadow-2xl backdrop-blur">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-cinzel text-lg text-text">{chapterLabel}</h2>
                <p className="mt-1 font-noto text-sm text-muted">Unlock for {coinPrice} coins</p>
              </div>

              <p className="flex items-center gap-1.5 font-noto text-xs text-muted">
                <Coins className="h-3.5 w-3.5 text-gold" /> Your balance: {balance} coins
              </p>

              {insufficient ? (
                <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-clay/40 bg-clay/10 p-3">
                  <p className="font-noto text-xs font-semibold text-clay2">
                    Insufficient coins — you have {balance}, this chapter costs {coinPrice}.
                  </p>
                  <Link href="/pricing#coins" className="font-noto text-xs font-semibold text-gold hover:underline">
                    Get Coins →
                  </Link>
                </div>
              ) : (
                <button type="button" onClick={handleUnlock} disabled={unlocking} className="btn-primary w-full">
                  {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : `Unlock for ${coinPrice} 🪙`}
                </button>
              )}

              <Link
                href="/pricing"
                className="flex items-center gap-1.5 font-noto text-xs font-semibold text-plat2 hover:underline"
              >
                <Sparkles className="h-3 w-3" /> Or go Platinum 💎
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
