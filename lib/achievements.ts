import toast from "react-hot-toast";
import {
  BookOpen,
  Crown,
  Flame,
  Globe2,
  Heart,
  Library,
  Rocket,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { unlockAchievement } from "./firestore";
import { createNotification } from "./notifications";
import { NotificationType, type UserProfile } from "@/types";

export type AchievementColor = "gold" | "plat" | "green";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: AchievementColor;
  /** Shown in the unlock toast, alongside the label. */
  emoji: string;
}

/** Any account created before this date counts as a founding-cohort "Early Adopter". */
const FOUNDING_COHORT_CUTOFF = new Date("2027-01-01T00:00:00.000Z").getTime();

/** The full achievement catalog shown on the profile's Achievements tab. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-chapter",
    label: "First Chapter",
    description: "Read your very first chapter.",
    icon: BookOpen,
    color: "green",
    emoji: "📖",
  },
  {
    id: "week-streak",
    label: "7-Day Streak",
    description: "Read at least one chapter for 7 days in a row.",
    icon: Flame,
    color: "gold",
    emoji: "🔥",
  },
  {
    id: "century-reader",
    label: "Century Reader",
    description: "Read 100 chapters total.",
    icon: Star,
    color: "gold",
    emoji: "⭐",
  },
  {
    id: "five-hundred-reader",
    label: "Voracious Reader",
    description: "Read 500 chapters total.",
    icon: Library,
    color: "gold",
    emoji: "📚",
  },
  {
    id: "legend",
    label: "Legend",
    description: "Read 1,000 chapters total.",
    icon: Trophy,
    color: "gold",
    emoji: "🏆",
  },
  {
    id: "platinum-member",
    label: "Platinum Member",
    description: "Subscribe to ÍléOtaku Platinum.",
    icon: Crown,
    color: "plat",
    emoji: "💎",
  },
  {
    id: "pan-african",
    label: "Pan-African",
    description: "Read 5 African original series.",
    icon: Globe2,
    color: "green",
    emoji: "🌍",
  },
  {
    id: "early-adopter",
    label: "Early Adopter",
    description: "Joined during ÍléOtaku's founding year.",
    icon: Sparkles,
    color: "plat",
    emoji: "✨",
  },
  {
    id: "creator-fan",
    label: "Creator Fan",
    description: "Follow 3 different creators.",
    icon: Heart,
    color: "green",
    emoji: "❤️",
  },
  {
    id: "power-reader",
    label: "Power Reader",
    description: "Read 10 chapters in a single day.",
    icon: Rocket,
    color: "gold",
    emoji: "🚀",
  },
];

/**
 * An achievement counts as unlocked if it's in the profile's stored `achievements` array, or
 * if it can be derived directly from other real profile fields (no separate flag needed).
 *
 * "pan-african" has no automatic condition: nothing in the current catalog tags a title as an
 * "African original" (the African Originals section is placeholder content with no real series
 * ids yet), so there's no real signal to check against — it stays manually-unlockable only
 * until that tagging exists. "power-reader" is the same: reading 10 chapters in one calendar
 * day isn't derivable from the lifetime-only `chaptersRead` counter this app tracks.
 */
export function isAchievementUnlocked(
  profile: UserProfile | null | undefined,
  achievementId: string
): boolean {
  if (!profile) return false;
  if (profile.achievements?.includes(achievementId)) return true;

  switch (achievementId) {
    case "first-chapter":
      return (profile.chaptersRead ?? 0) >= 1;
    case "week-streak":
      return (profile.streakDays?.length ?? 0) >= 7;
    case "century-reader":
      return (profile.chaptersRead ?? 0) >= 100;
    case "five-hundred-reader":
      return (profile.chaptersRead ?? 0) >= 500;
    case "legend":
      return (profile.chaptersRead ?? 0) >= 1000;
    case "platinum-member":
      return profile.isPlatinum === true;
    case "early-adopter":
      return new Date(profile.createdAt).getTime() < FOUNDING_COHORT_CUTOFF;
    case "creator-fan":
      return (profile.following?.length ?? 0) >= 3;
    default:
      return false;
  }
}

/**
 * Runs after any significant action (chapter completion, a streak update, Platinum activation)
 * to check every achievement condition against the given profile and award any newly-unlocked
 * ones: writes them onto the profile, fires an ACHIEVEMENT_UNLOCKED notification, and shows a
 * toast. `profile` should be the freshest copy the caller has (post-update), since conditions
 * like chaptersRead/isPlatinum/streakDays need the new values, not a stale snapshot.
 */
export async function checkAndAwardAchievements(
  uid: string,
  profile: UserProfile
): Promise<Achievement[]> {
  const alreadyUnlocked = new Set(profile.achievements ?? []);
  const newlyUnlocked = ACHIEVEMENTS.filter(
    (a) => !alreadyUnlocked.has(a.id) && isAchievementUnlocked(profile, a.id)
  );

  for (const achievement of newlyUnlocked) {
    await unlockAchievement(uid, achievement.id);
    await createNotification(
      uid,
      NotificationType.ACHIEVEMENT_UNLOCKED,
      "Achievement unlocked!",
      achievement.label,
      "/profile?tab=achievements"
    );
    toast.success(`${achievement.emoji} Achievement unlocked: ${achievement.label}`);
  }

  return newlyUnlocked;
}
