"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Coins, Loader2, Lock, Sparkles } from "lucide-react";
import RewardedAdModal from "@/components/ads/RewardedAdModal";
import { AD_CONFIG, type AdStatus } from "@/lib/adConfig";
import { fetchAdStatus, type ClaimResult } from "@/lib/rewardedAds";
import {
  getLockConfig,
  isChapterUnlocked,
  unlockChapterWithCoins,
  type LockConfig,
} from "@/lib/contentLocking";
import { proxyImg } from "@/lib/manga-api";
import type { UserProfile } from "@/types";

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
        mangaId={mangaId}
        chapterId={chapterId}
        signedIn={!!userProfile?.uid}
        coinPrice={userProfile?.uid ? state.config.coinPrice : undefined}
        balance={balance}
        onUnlockWithCoins={async () => {
          if (!userProfile?.uid) return false;
          const price = state.config.coinPrice ?? 0;
          const result = await unlockChapterWithCoins(userProfile.uid, mangaId, chapterId, price);
          if (!result.success) {
            toast.error(result.message ?? "Couldn't unlock this chapter.");
            return false;
          }
          setBalance((b) => b - price);
          setState({ status: "open" });
          return true;
        }}
        onUnlocked={() => {
          // The server already wrote the unlock when the third ad was counted.
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

/** Beta feedback (instructed by Zamyilton): "a watch 3 ads to unlock the next chapter (2 chapters a day)."
 * Each ad is opened and verified by the server (app/api/ads/*): the browser can't skip, fast-forward or forge
 * one, and the 3-ads-per-chapter / 2-chapters-per-day rules are enforced there. The third ad's claim writes
 * the unlock itself. */
function AdGate({
  mangaTitle,
  chapterLabel,
  mangaId,
  chapterId,
  signedIn,
  coinPrice,
  balance,
  onUnlockWithCoins,
  onUnlocked,
  children,
}: {
  mangaTitle: string;
  chapterLabel: string;
  mangaId: string;
  chapterId: string;
  signedIn: boolean;
  /** Price of skipping the ads with coins; undefined hides the option (e.g. signed-out readers). */
  coinPrice?: number;
  balance: number;
  onUnlockWithCoins: () => Promise<boolean>;
  onUnlocked: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [payingCoins, setPayingCoins] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<AdStatus | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (signedIn) fetchAdStatus().then(setStatus).catch(() => setStatus(null));
  }, [signedIn]);

  const perChapter = AD_CONFIG.chapter.adsPerChapter;
  const watched = status?.chapter.progress[chapterId] ?? 0;
  const chaptersLeft = status ? status.chapter.perDay - status.chapter.unlockedToday : AD_CONFIG.chapter.chaptersPerDay;
  const capped = chaptersLeft <= 0;

  async function handleDone(result: ClaimResult) {
    setPlaying(false);
    setStatus(result.status);
    if (result.chapterUnlocked) {
      toast.success("Chapter unlocked!");
      setFading(true);
      await onUnlocked();
    } else {
      toast.success(`Ad ${result.chapterProgress} of ${perChapter} done`);
    }
  }

  return (
    <div className="relative flex flex-1 overflow-hidden bg-bg">
      <AnimatePresence>
        {!fading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            data-testid="ad-gate"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black px-6 text-center"
          >
            <div>
              <p className="font-cinzel text-lg tracking-wide text-gold">ÍléOtaku</p>
              <p className="mt-1 font-noto text-xs text-ivory/70">{mangaTitle}</p>
            </div>

            <h2 className="font-cinzel text-xl text-ivory">Watch {perChapter} short ads to unlock this chapter</h2>

            <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2" data-testid="ad-gate-progress" aria-label={`${watched} of ${perChapter} ads watched`}>
                {Array.from({ length: perChapter }, (_, i) => (
                  <span
                    key={i}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                      i < watched ? "border-clay bg-clay text-ivory" : "border-white/25 text-ivory/50"
                    }`}
                  >
                    {i < watched ? "✓" : i + 1}
                  </span>
                ))}
              </div>
              {!signedIn ? (
                <Link href="/auth/login" className="btn-primary">Sign in to unlock with ads</Link>
              ) : capped ? (
                <p className="font-noto text-xs text-ivory/70" data-testid="ad-gate-capped">
                  You&apos;ve unlocked {AD_CONFIG.chapter.chaptersPerDay} chapters with ads today. The limit resets tomorrow — or unlock this one with coins.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    data-testid="ad-gate-watch"
                    className="flex items-center gap-2 rounded-full bg-clay px-5 py-2 font-syne text-sm font-semibold text-ivory hover:bg-clay2"
                  >
                    <Clapperboard className="h-4 w-4" /> Watch ad {Math.min(watched + 1, perChapter)} of {perChapter}
                  </button>
                  <p className="font-noto text-[11px] text-ivory/50">
                    {AD_CONFIG.adSeconds}s each · {chaptersLeft} of {AD_CONFIG.chapter.chaptersPerDay} ad-unlocks left today
                  </p>
                </>
              )}
            </div>

            {coinPrice !== undefined && (
              <button
                type="button"
                disabled={payingCoins || balance < coinPrice}
                onClick={async () => {
                  setPayingCoins(true);
                  const ok = await onUnlockWithCoins();
                  setPayingCoins(false);
                  if (ok) setFading(true);
                }}
                className="flex items-center gap-1.5 rounded-full border border-gold/50 px-4 py-1.5 font-noto text-xs font-semibold text-gold hover:bg-gold/10 disabled:opacity-50"
              >
                {payingCoins ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                {balance < coinPrice ? `Skip the ads — ${coinPrice} 🪙 (you have ${balance})` : `Skip the ads — unlock for ${coinPrice} 🪙`}
              </button>
            )}

            <Link href="/pricing" className="flex items-center gap-1.5 font-noto text-xs font-semibold text-plat2 hover:underline">
              Or go Platinum for unlimited reading 💎
            </Link>

            <p className="max-w-xs font-noto text-[11px] text-ivory/40">Reading {chapterLabel}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <RewardedAdModal
        open={playing}
        purpose="chapter"
        target={{ mangaId, chapterId }}
        onClose={() => setPlaying(false)}
        onDone={handleDone}
        onError={(m) => toast.error(m)}
      />
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
