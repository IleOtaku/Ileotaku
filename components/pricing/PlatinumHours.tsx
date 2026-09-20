"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Clock, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  PLATINUM_HOUR_COIN_PRICE,
  PLATINUM_HOUR_PRICE_NGN,
  PLATINUM_MAX_HOURS_PER_WEEK,
  platinumHoursLeftThisWeek,
  purchasePlatinumHours,
} from "@/lib/payments";

/** Beta feedback: "there's also time based platinum... 1hr is 200 naira, maximum allowed hours per
 * week is 5 hours." Pay-as-you-go Platinum — 1 to 5 hours, by card or coins. */
export default function PlatinumHours() {
  const { user, profile } = useAuth();
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState<"card" | "coins" | null>(null);

  const left = platinumHoursLeftThisWeek(profile);
  const onRealPlan = !!profile?.isPlatinum && profile.platinumTier !== "hourly";
  const hourlyUntil = profile?.isPlatinum && profile.platinumTier === "hourly" && profile.platinumUntil ? new Date(profile.platinumUntil) : null;
  const running = hourlyUntil && hourlyUntil.getTime() > Date.now();
  const pick = Math.min(hours, Math.max(1, left));

  async function buy(method: "card" | "coins") {
    if (!user || busy) return;
    setBusy(method);
    try {
      const result = await purchasePlatinumHours(user, pick, method);
      if (result.success) toast.success(`Platinum unlocked for ${pick} hour${pick === 1 ? "" : "s"}!`);
      else toast.error(result.message ?? "Couldn't buy Platinum hours.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="px-4 pb-6" data-testid="platinum-hours">
      <div className="mx-auto max-w-3xl rounded-2xl border border-bg4 bg-bg2 p-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <p className="font-syne text-base font-semibold text-text">Platinum by the hour</p>
            <p className="font-noto text-xs text-muted">
              ₦{PLATINUM_HOUR_PRICE_NGN} per hour (or {PLATINUM_HOUR_COIN_PRICE} coins), up to {PLATINUM_MAX_HOURS_PER_WEEK} hours a
              week — all Platinum perks, only while you need them.
            </p>
            {running && hourlyUntil && (
              <p className="mt-1 font-noto text-xs text-gold2">
                Platinum active until {hourlyUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {!user ? (
          <Link href="/auth/login" className="btn-primary mt-4 w-full justify-center">
            Sign In to Buy
          </Link>
        ) : onRealPlan ? (
          <p className="mt-4 font-noto text-sm text-muted">You already have a Platinum plan — no need to buy hours.</p>
        ) : left === 0 ? (
          <p className="mt-4 font-noto text-sm text-muted">
            You&apos;ve used all {PLATINUM_MAX_HOURS_PER_WEEK} hours this week. It resets on Monday.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Hours of Platinum">
              {Array.from({ length: left }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={pick === n}
                  onClick={() => setHours(n)}
                  className={`rounded-full border px-3.5 py-1.5 font-noto text-sm ${
                    pick === n ? "border-gold bg-gold/15 text-gold2" : "border-bg4 text-muted hover:text-text"
                  }`}
                >
                  {n} hr{n === 1 ? "" : "s"}
                </button>
              ))}
              <span className="font-noto text-xs text-muted">{left} of {PLATINUM_MAX_HOURS_PER_WEEK} left this week</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => buy("card")} disabled={!!busy} className="btn-primary flex-1 justify-center">
                {busy === "card" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ₦${(pick * PLATINUM_HOUR_PRICE_NGN).toLocaleString()}`}
              </button>
              <button
                type="button"
                onClick={() => buy("coins")}
                disabled={!!busy || (profile?.coins ?? 0) < pick * PLATINUM_HOUR_COIN_PRICE}
                className="btn-ghost flex-1 justify-center disabled:opacity-40"
              >
                {busy === "coins" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Use ${pick * PLATINUM_HOUR_COIN_PRICE} 🪙`}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
