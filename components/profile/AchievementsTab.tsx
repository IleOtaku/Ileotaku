"use client";

import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ACHIEVEMENTS, isAchievementUnlocked, type AchievementColor } from "@/lib/achievements";

const COLOR_CLASSES: Record<AchievementColor, string> = {
  gold: "border-gold/40 bg-gold/10 text-gold",
  plat: "border-plat/40 bg-plat/10 text-plat2",
  green: "border-green/40 bg-green/10 text-green2",
};

/** 9 achievement cards, unlocked/locked based on real profile data from Firestore. */
export default function AchievementsTab() {
  const { profile } = useAuth();

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ACHIEVEMENTS.map((a) => {
        const unlocked = isAchievementUnlocked(profile, a.id);
        return (
          <div
            key={a.id}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-5 text-center ${
              unlocked ? COLOR_CLASSES[a.color] : "border-bg4 bg-bg2 opacity-50"
            }`}
          >
            {unlocked ? <a.icon className="h-7 w-7" /> : <Lock className="h-7 w-7 text-muted" />}
            <p className="font-syne text-sm font-semibold text-text">{a.label}</p>
            <p className="font-noto text-xs text-muted">{a.description}</p>
          </div>
        );
      })}
    </div>
  );
}
