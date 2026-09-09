"use client";

import { useState } from "react";
import Link from "next/link";
import { Coins, Crown, Dices, Flame } from "lucide-react";
import CoinRoulette from "@/components/monetisation/CoinRoulette";
import { Modal } from "@/components/ui";
import type { UserProfile } from "@/types";

export interface ProfileSidebarProps {
  profile: UserProfile | null;
}

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Coin balance + daily-spin launcher, membership status, and a 7-day reading streak widget. */
export default function ProfileSidebar({ profile }: ProfileSidebarProps) {
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const isPlatinum = profile?.isPlatinum === true;
  const streakDays = profile?.streakDays ?? [];
  const streak = streakDays.length;
  const spunToday = profile?.lastRouletteSpin === todayKey();

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <span className="flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Coins className="h-4 w-4 text-gold" /> Coin Balance
        </span>
        <p className="mt-2 font-cinzel text-2xl text-gold2">
          {(profile?.coins ?? 0).toLocaleString()}
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/pricing#coins" className="btn-gold flex-1 justify-center text-sm">
            Top Up
          </Link>
          <button
            type="button"
            onClick={() => setRouletteOpen(true)}
            className="btn-ghost flex-1 justify-center text-sm"
          >
            <Dices className="h-4 w-4" /> {spunToday ? "View Spin" : "Spin"}
          </button>
        </div>
      </div>

      <div
        className={`rounded-2xl border p-5 ${isPlatinum ? "border-plat/40 bg-plat/5" : "border-bg4 bg-bg2"}`}
      >
        <span className="flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Crown className={`h-4 w-4 ${isPlatinum ? "text-plat2" : "text-muted"}`} /> Membership
        </span>
        {isPlatinum ? (
          <>
            <p className="mt-2 font-noto text-xs text-muted">
              You&apos;re Platinum
              {profile?.platinumUntil
                ? ` until ${new Date(profile.platinumUntil).toLocaleDateString()}`
                : ""}
              .
            </p>
            <span className="badge-plat mt-3 inline-flex">Platinum</span>
          </>
        ) : (
          <>
            <p className="mt-2 font-noto text-xs text-muted">
              Go Platinum for zero ads and early chapters.
            </p>
            <Link href="/pricing" className="btn-plat mt-3 w-full justify-center text-sm">
              Get Platinum
            </Link>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <span className="flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Flame className="h-4 w-4 text-clay2" /> Reading Streak
        </span>
        <p className="mt-1 font-noto text-xs text-muted">
          {streak} day{streak === 1 ? "" : "s"} in a row
        </p>
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className={`h-6 w-6 rounded-full ${i < Math.min(streak, 7) ? "bg-clay" : "bg-bg4"}`}
            />
          ))}
        </div>
      </div>

      {/* Sprint 9e (13b): an empty placeholder for now — wired to AdSense in Sprint 11. Renders
          for free accounts only; Platinum profiles get no ad slot in the DOM at all, matching
          "Platinum users should experience the platform as if ads were never a concept." */}
      {!isPlatinum && (
        <div className="flex min-h-[250px] items-center justify-center rounded-2xl border border-dashed border-bg4 bg-bg2/50 font-noto text-xs text-muted">
          Advertisement
        </div>
      )}

      <Modal open={rouletteOpen} onClose={() => setRouletteOpen(false)} title="Daily Spin">
        <CoinRoulette />
      </Modal>
    </div>
  );
}
