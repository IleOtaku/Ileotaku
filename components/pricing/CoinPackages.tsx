"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Coins, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { COIN_PACKS, purchaseCoins, type CoinPack } from "@/lib/payments";
import { formatDualPrice } from "@/lib/utils";

/** Coin bundle grid, wired to real Paystack checkout via purchaseCoins. */
export default function CoinPackages() {
  const { user, profile } = useAuth();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  async function handleBuy(pack: CoinPack) {
    if (!user) {
      toast.error("Sign in to buy coins.");
      return;
    }
    setPurchasingId(pack.id);
    try {
      const result = await purchaseCoins(user, pack);
      if (result.success) {
        toast.success("Coins added to your wallet! 🪙");
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
      } else {
        toast.error(result.message ?? "Couldn't complete this purchase.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPurchasingId(null);
    }
  }

  return (
    <section id="coins" className="scroll-mt-24 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 text-center">
          <h2 className="font-cinzel text-2xl text-text sm:text-3xl">Buy Coins</h2>
          <p className="mt-2 font-noto text-sm text-muted">
            Unlock individual premium chapters or tip a creator directly — no subscription
            required. Use coins to unlock premium manga chapters at 10-20 coins each, based on how
            popular a title is.
          </p>
          <p className="mt-1.5 font-noto text-xs text-muted">
            Charged in Nigerian Naira via Paystack — USD shown is an approximate equivalent for
            reference. Your bank or card network converts to your local currency automatically.
          </p>
          {user && (
            <p className="mt-3 flex items-center justify-center gap-1.5 font-noto text-xs text-muted">
              <Coins className="h-3.5 w-3.5 text-gold2" /> Your balance:{" "}
              <span className="text-gold2">{(profile?.coins ?? 0).toLocaleString()}</span>
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {COIN_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={`relative flex flex-col items-center gap-3 rounded-2xl border p-6 text-center ${
                pack.bestValue ? "border-gold bg-bg3" : "border-bg4 bg-bg2"
              }`}
            >
              {pack.bestValue && (
                <span className="absolute -top-3 rounded-full bg-gold px-3 py-1 font-syne text-[10px] font-bold text-bg">
                  Best Value
                </span>
              )}
              <Coins className="h-8 w-8 text-gold" />
              <p className="font-cinzel text-xl text-text">
                {pack.coins}
                {pack.bonus > 0 && <span className="text-green2"> +{pack.bonus}</span>}
              </p>
              <p className="font-noto text-xs text-muted">coins</p>
              <p className="font-syne text-lg font-bold text-gold2">
                {formatDualPrice(pack.priceNGN, pack.priceUSD)}
              </p>
              {user ? (
                <button
                  type="button"
                  onClick={() => handleBuy(pack)}
                  disabled={purchasingId !== null}
                  className="btn-primary w-full justify-center"
                >
                  {purchasingId === pack.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Buy Now"
                  )}
                </button>
              ) : (
                <Link href="/auth/login" className="btn-primary w-full justify-center">
                  Sign In to Buy
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
