"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Rocket } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { BOOST_TIERS, boostPost } from "@/lib/creatorFeed";

export interface BoostModalProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  /** Called after a successful boost with the tier and its new expiry, so the card can flip to
   * "Promoted" immediately without waiting on a refetch. */
  onBoosted: (level: 1 | 2 | 3, boostExpiresAt: string) => void;
}

const TIER_LEVELS: (1 | 2 | 3)[] = [1, 2, 3];

/** Coin-spend confirmation modal for boosting a post — opened from FeedPostCard's three-dot
 * menu ("Boost This Post"). Shows all three tiers with their cost, duration, and score
 * multiplier; the signed-in user's current coin balance gates which tiers are actually
 * affordable. */
export default function BoostModal({ open, onClose, postId, onBoosted }: BoostModalProps) {
  const { user, profile } = useAuth();
  const [boostingLevel, setBoostingLevel] = useState<1 | 2 | 3 | null>(null);
  const balance = profile?.coins ?? 0;

  async function handleBoost(level: 1 | 2 | 3) {
    if (!user) return;
    setBoostingLevel(level);
    try {
      const result = await boostPost(user.uid, postId, level);
      if (!result.success) {
        toast.error(result.message ?? "Couldn't boost this post.");
        return;
      }
      toast.success(`${BOOST_TIERS[level].label} activated!`);
      onBoosted(level, new Date(Date.now() + BOOST_TIERS[level].hours * 3_600_000).toISOString());
      onClose();
    } finally {
      setBoostingLevel(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Boost This Post">
      <p className="mb-4 font-noto text-xs text-muted">
        Spend coins to multiply this post&apos;s For You ranking for a limited time. Your balance:{" "}
        <span className="font-semibold text-gold">{balance} 🪙</span>
      </p>
      <div className="flex flex-col gap-2">
        {TIER_LEVELS.map((level) => {
          const tier = BOOST_TIERS[level];
          const affordable = balance >= tier.cost;
          return (
            <button
              key={level}
              type="button"
              onClick={() => handleBoost(level)}
              disabled={!affordable || boostingLevel !== null}
              className="flex items-center justify-between gap-3 rounded-xl border border-bg4 bg-bg3 px-4 py-3 text-left transition-colors hover:border-clay disabled:opacity-40"
            >
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-clay2" />
                <div>
                  <p className="font-syne text-sm font-semibold text-text">{tier.label}</p>
                  <p className="font-noto text-[11px] text-muted">
                    {tier.multiplier}x ranking for {tier.hours}h
                  </p>
                </div>
              </div>
              {boostingLevel === level ? (
                <Loader2 className="h-4 w-4 animate-spin text-clay2" />
              ) : (
                <span className="font-noto text-sm font-semibold text-gold">{tier.cost} 🪙</span>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
