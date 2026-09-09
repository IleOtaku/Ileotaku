"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Flame, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { claimStreak } from "@/lib/payments";

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** 7-day streak strip + claim CTA + milestone-bonus countdown, backed by claimStreak. */
export default function StreakCard() {
  const { user, profile } = useAuth();
  const [claiming, setClaiming] = useState(false);

  const streakDays = profile?.streakDays ?? [];
  const today = todayKey();
  const readToday = streakDays.includes(today);
  const streakCount = streakDays.length;

  const nextMilestone = streakCount < 7 ? 7 : streakCount < 30 ? 30 : null;
  const nextBonus = nextMilestone === 7 ? 10 : 50;

  async function handleClaim() {
    if (!user || claiming) return;
    setClaiming(true);
    try {
      const result = await claimStreak(user);
      if (result.bonusAwarded > 0) {
        toast.success(`${result.streakCount}-day streak! +${result.bonusAwarded} coins 🔥`);
      } else if (!result.alreadyClaimedToday) {
        toast.success(`Streak extended to ${result.streakCount} days!`);
      }
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
    } catch {
      toast.error("Couldn't update your streak. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  // Last 7 calendar days, oldest first, so "today" is always the rightmost dot.
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return todayKey(d);
  });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-6">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Flame className="h-4 w-4 text-clay2" /> Reading Streak
        </span>
        <span className="font-cinzel text-lg text-gold">{streakCount}</span>
      </div>

      <div className="flex justify-between gap-1.5">
        {last7.map((day) => (
          <span
            key={day}
            className={`h-6 w-6 rounded-full ${streakDays.includes(day) ? "bg-clay" : "bg-bg4"}`}
          />
        ))}
      </div>

      {!readToday ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming}
          className="btn-primary justify-center text-sm"
        >
          {claiming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Read something today to keep your streak!"
          )}
        </button>
      ) : (
        <p className="text-center font-noto text-xs text-green2">
          ✓ You&apos;ve kept your streak today!
        </p>
      )}

      {nextMilestone !== null && (
        <p className="text-center font-noto text-[11px] text-muted">
          {nextMilestone} days = {nextBonus} coins bonus — {nextMilestone - streakCount} day
          {nextMilestone - streakCount === 1 ? "" : "s"} to go!
        </p>
      )}
    </div>
  );
}
