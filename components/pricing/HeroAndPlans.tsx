"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Check, Coins, Crown, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { COIN_PACKS, PLATINUM_PLANS, subscribePlatinum, type PlatinumTier } from "@/lib/payments";
import { loadPaystackScript } from "@/lib/paystack";
import { formatDualPrice } from "@/lib/utils";

type Billing = "monthly" | "annual";

const MONTHLY_PLAN = PLATINUM_PLANS.find((p) => p.tier === "monthly")!;
const ANNUAL_PLAN = PLATINUM_PLANS.find((p) => p.tier === "annual")!;
const CHEAPEST_COIN_PACK = COIN_PACKS[0];

/** Pricing hero: kente bar, headline, billing toggle, and the three plan cards it drives. */
export default function HeroAndPlans() {
  const { user } = useAuth();
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    loadPaystackScript().catch(() => {
      // Non-fatal — purchase attempts will surface a friendly error if Paystack never loads.
    });
  }, []);

  // Annual is billed as one lump sum, so its "/month" figure is the yearly price divided by 12.
  const platinumMonthlyNGN =
    billing === "monthly" ? MONTHLY_PLAN.priceNGN : Math.round(ANNUAL_PLAN.priceNGN / 12);
  const platinumMonthlyUSD =
    billing === "monthly" ? MONTHLY_PLAN.priceUSD : ANNUAL_PLAN.priceUSD / 12;
  const platinumPeriod =
    billing === "monthly"
      ? "/month"
      : `/month, billed ${formatDualPrice(ANNUAL_PLAN.priceNGN, ANNUAL_PLAN.priceUSD)}/yr`;
  const platinumTier: PlatinumTier = billing === "monthly" ? "monthly" : "annual";

  async function handleGoPlatinum() {
    if (!user) {
      router.push("/auth/signup");
      return;
    }
    setSubscribing(true);
    try {
      const result = await subscribePlatinum(user, platinumTier);
      if (result.success) {
        toast.success("Welcome to Platinum! 💎");
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
      } else {
        toast.error(result.message ?? "Couldn't complete your subscription.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <section className="px-4 pb-20 pt-16 sm:px-6">
      <div className="kente-bar mx-auto max-w-4xl rounded-full" />

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-syne text-sm uppercase tracking-[0.25em] text-gold"
        >
          Plans for every kind of reader
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 font-cinzel text-4xl font-bold text-text sm:text-5xl"
        >
          Read Free. Go Legendary with <span className="text-gold">Platinum</span>
        </motion.h1>

        <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-muted2 bg-bg3 p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-4 py-2 font-syne text-sm font-semibold transition-colors ${
              billing === "monthly" ? "bg-clay text-ivory" : "text-muted"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 font-syne text-sm font-semibold transition-colors ${
              billing === "annual" ? "bg-clay text-ivory" : "text-muted"
            }`}
          >
            Annual
            <span className="rounded-full bg-green/20 px-2 py-0.5 text-[10px] font-bold text-green2">
              Save 20%
            </span>
          </button>
        </div>

        <p className="mt-4 font-noto text-xs text-muted">
          Prices are charged in Nigerian Naira (₦) via Paystack. USD figures are an approximate
          equivalent for reference — your bank or card network handles the conversion to your
          local currency automatically.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-bg4 bg-bg3/60 p-6">
          <Sparkles className="h-6 w-6 text-text" />
          <h3 className="mt-3 font-syne text-lg font-bold text-text">Free</h3>
          <p className="mt-1 font-cinzel text-2xl text-text">
            ₦0<span className="ml-1 font-noto text-xs text-muted">forever</span>
          </p>
          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {[
              "Access to the full free catalog",
              "Read in 30+ languages",
              "Follow your favorite creators",
              "Community chat",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 font-noto text-sm text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green2" />
                {f}
              </li>
            ))}
          </ul>
          <Link href="/auth/signup" className="btn-ghost mt-6 justify-center">
            Start Free
          </Link>
        </div>

        <div className="flex flex-col rounded-2xl border border-gold bg-bg3 p-6 transition-transform sm:scale-110 sm:shadow-2xl">
          <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-gold px-3 py-1 font-syne text-[11px] font-bold text-bg">
            <Crown className="h-3 w-3" /> Most Popular
          </span>
          <Crown className="h-6 w-6 text-plat2" />
          <h3 className="mt-3 font-syne text-lg font-bold text-text">Platinum</h3>
          <p className="mt-1 font-cinzel text-2xl text-text">
            {formatDualPrice(platinumMonthlyNGN, platinumMonthlyUSD)}
            <span className="ml-1 font-noto text-xs text-muted">{platinumPeriod}</span>
          </p>
          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {[
              "Everything in Free",
              "Zero ads, ever",
              "Unlimited access to all imported manga — no chapter locks",
              "Early access to new chapters",
              "HD page quality + offline downloads",
              "5 exclusive reading themes (Midnight, Sakura, Matrix + more)",
              "Detailed reading stats dashboard",
              "Custom profile tagline",
              "Reading activity privacy controls",
              "Daily reading reminders",
              "Ad-free profile page",
              "Priority support queue",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 font-noto text-sm text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green2" />
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleGoPlatinum}
            disabled={subscribing}
            className="btn-gold mt-6 justify-center"
          >
            {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go Platinum"}
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-bg4 bg-bg3/60 p-6">
          <Coins className="h-6 w-6 text-gold2" />
          <h3 className="mt-3 font-syne text-lg font-bold text-text">Coins</h3>
          <p className="mt-1 font-cinzel text-2xl text-text">Pay as you go</p>
          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {[
              "Unlock premium chapters",
              "Tip your favorite creators",
              "No subscription required",
              `Bundles from ${formatDualPrice(CHEAPEST_COIN_PACK.priceNGN, CHEAPEST_COIN_PACK.priceUSD)}`,
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 font-noto text-sm text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green2" />
                {f}
              </li>
            ))}
          </ul>
          <a href="#coins" className="btn-ghost mt-6 justify-center">
            Buy Coins
          </a>
        </div>
      </div>
    </section>
  );
}
