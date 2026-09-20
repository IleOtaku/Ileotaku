"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Clapperboard, Coins, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AD_CONFIG, PLATINUM_BURSTS_PER_DAY, type AdPurpose, type AdStatus } from "@/lib/adConfig";
import { fetchAdStatus, type ClaimResult } from "@/lib/rewardedAds";
import RewardedAdModal from "./RewardedAdModal";

/** "Free coins & perks" — the rewarded-ad menu on the pricing page. Watch an ad for 1–10 coins (5 a day), or
 * watch 3 ads for an hour of Platinum. Never shown to Platinum members (they never see ads). */
export default function WatchAdsCard() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<AdStatus | null>(null);
  const [playing, setPlaying] = useState<AdPurpose | null>(null);

  const refresh = useCallback(() => {
    fetchAdStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  if (!user || profile?.isPlatinum) return null;

  function done(r: ClaimResult) {
    setPlaying(null);
    setStatus(r.status);
    if (r.purpose === "coins") toast.success(`+${r.coinsAwarded} coins!`);
    else if (r.platinumUnlocked) toast.success(`Platinum unlocked for ${AD_CONFIG.platinum.hours} hour!`);
    else toast.success(`Ad counted — ${r.platinumProgress}/${AD_CONFIG.platinum.adsRequired}`);
  }

  const coinsLeft = status ? status.coins.perDay - status.coins.watched : AD_CONFIG.coins.perDay;
  const burstsLeft = status ? status.platinum.maxBursts - status.platinum.bursts : PLATINUM_BURSTS_PER_DAY;

  return (
    <section className="px-4 pb-6" data-testid="watch-ads-card">
      <div className="mx-auto max-w-3xl rounded-2xl border border-bg4 bg-bg2 p-5">
        <p className="mb-3 flex items-center gap-2 font-syne text-base font-semibold text-text">
          <Clapperboard className="h-5 w-5 text-gold" /> Watch ads, earn perks
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Coins className="h-6 w-6 shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <p className="font-noto text-sm text-text">Free coins</p>
              <p className="font-noto text-xs text-muted" data-testid="coins-ad-left">
                Watch a {AD_CONFIG.adSeconds}s ad for 1–10 coins · {coinsLeft} of {AD_CONFIG.coins.perDay} left today
              </p>
            </div>
            <button type="button" onClick={() => setPlaying("coins")} disabled={coinsLeft <= 0} data-testid="watch-ad-coins" className="btn-primary shrink-0 disabled:opacity-40">
              Watch
            </button>
          </div>
          <div className="flex items-center gap-3 border-t border-bg4 pt-3">
            <Crown className="h-6 w-6 shrink-0 text-plat2" />
            <div className="min-w-0 flex-1">
              <p className="font-noto text-sm text-text">{AD_CONFIG.platinum.hours} hour of Platinum</p>
              <p className="font-noto text-xs text-muted" data-testid="platinum-ad-progress">
                Watch {AD_CONFIG.platinum.adsRequired} ads ({status?.platinum.watched ?? 0}/{AD_CONFIG.platinum.adsRequired} today) · {AD_CONFIG.platinum.adsPerDay} ads a day max
              </p>
            </div>
            <button type="button" onClick={() => setPlaying("platinum")} disabled={burstsLeft <= 0} data-testid="watch-ad-platinum" className="btn-ghost shrink-0 disabled:opacity-40">
              Watch
            </button>
          </div>
        </div>
        <p className="mt-3 font-noto text-[11px] text-muted">
          Prefer no ads at all? <Link href="#platinum" className="text-gold hover:underline">Go Platinum</Link>.
        </p>
      </div>
      <RewardedAdModal open={playing !== null} purpose={playing ?? "coins"} onClose={() => setPlaying(null)} onDone={done} onError={(m) => toast.error(m)} />
    </section>
  );
}
