import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, setDoc } from "firebase/firestore";
import type { CoinTransaction } from "@/types";
import { checkAndAwardAchievements } from "./achievements";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateUserPrefs } from "./firestore";
import { initializePaystackPayment } from "./paystack";

/* ---------------------------- Coin packs & Platinum plans ---------------------------- */

export interface CoinPack {
  id: string;
  coins: number;
  bonus: number;
  /** Actual charge amount and currency — Paystack settles in NGN. */
  priceNGN: number;
  /** Display-only approximate USD equivalent, shown alongside the NGN price. */
  priceUSD: number;
  label: string;
  bestValue?: boolean;
}

/** NGN is the real charge currency; USD is an approximate equivalent for display only (~₦1,500/$1). */
export const COIN_PACKS: CoinPack[] = [
  { id: "pack-50", coins: 50, bonus: 0, priceNGN: 1500, priceUSD: 0.99, label: "50 coins" },
  { id: "pack-130", coins: 130, bonus: 0, priceNGN: 3000, priceUSD: 1.99, label: "130 coins" },
  {
    id: "pack-300",
    coins: 300,
    bonus: 30,
    priceNGN: 6000,
    priceUSD: 3.99,
    label: "300 + 30 coins",
    bestValue: true,
  },
  { id: "pack-800", coins: 800, bonus: 80, priceNGN: 15000, priceUSD: 9.99, label: "800 + 80 coins" },
];

export type PlatinumTier = "monthly" | "annual" | "student" | "family";

export interface PlatinumPlan {
  tier: PlatinumTier;
  label: string;
  /** Actual charge amount and currency — Paystack settles in NGN. */
  priceNGN: number;
  /** Display-only approximate USD equivalent, shown alongside the NGN price. */
  priceUSD: number;
  months: number;
}

/** NGN is the real charge currency; USD is an approximate equivalent for display only (~₦1,500/$1). */
export const PLATINUM_PLANS: PlatinumPlan[] = [
  { tier: "monthly", label: "Monthly", priceNGN: 7500, priceUSD: 5, months: 1 },
  { tier: "annual", label: "Annual", priceNGN: 72000, priceUSD: 48, months: 12 },
  { tier: "student", label: "Student", priceNGN: 4500, priceUSD: 2.5, months: 1 },
  { tier: "family", label: "Family", priceNGN: 15000, priceUSD: 8, months: 1 },
];

export interface PaymentResult {
  success: boolean;
  message?: string;
}

async function addTransaction(
  uid: string,
  tx: Omit<CoinTransaction, "id" | "userId" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "users", uid, "transactions"), {
    ...tx,
    userId: uid,
    createdAt: new Date().toISOString(),
  });
}

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/* ---------------------------- Coins ---------------------------- */

/** Opens Paystack for one coin pack; on success, credits the coins and logs a transaction. */
export async function purchaseCoins(user: User, pack: CoinPack): Promise<PaymentResult> {
  let reference: string;
  try {
    const result = await initializePaystackPayment(user.email ?? "", pack.priceNGN, "NGN", {
      type: "coin_purchase",
      packId: pack.id,
      uid: user.uid,
    });
    reference = result.reference;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Payment was cancelled." };
  }

  try {
    const totalCoins = pack.coins + pack.bonus;
    const profile = await getUserProfile(user.uid);
    const newBalance = (profile?.coins ?? 0) + totalCoins;

    await updateUserPrefs(user.uid, { coins: newBalance });
    await addTransaction(user.uid, {
      type: "purchase",
      amount: totalCoins,
      balanceAfter: newBalance,
      description: `Purchased ${pack.label}`,
      category: "coins",
      amountNGN: pack.priceNGN,
      paystackRef: reference,
    });

    return { success: true };
  } catch (error) {
    // The Paystack charge already succeeded at this point — a failure here means the user
    // paid but wasn't credited, which is exactly the kind of gap the error log needs to
    // surface for manual reconciliation rather than silently disappearing.
    await logError(error, { operation: "purchaseCoins", uid: user.uid, packId: pack.id, reference });
    return {
      success: false,
      message: "Payment succeeded but crediting your coins failed — contact support with reference " + reference,
    };
  }
}

/* ---------------------------- Platinum ---------------------------- */

/** Opens Paystack for one Platinum plan; on success, activates Platinum for that plan's duration. */
export async function subscribePlatinum(user: User, tier: PlatinumTier): Promise<PaymentResult> {
  const plan = PLATINUM_PLANS.find((p) => p.tier === tier);
  if (!plan) return { success: false, message: "Unknown plan." };

  let reference: string;
  try {
    const result = await initializePaystackPayment(user.email ?? "", plan.priceNGN, "NGN", {
      type: "platinum_subscription",
      tier,
      uid: user.uid,
    });
    reference = result.reference;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Payment was cancelled." };
  }

  try {
    const platinumUntil = new Date();
    platinumUntil.setMonth(platinumUntil.getMonth() + plan.months);

    await updateUserPrefs(user.uid, {
      isPlatinum: true,
      platinumTier: tier,
      platinumUntil: platinumUntil.toISOString(),
    });

    const profile = await getUserProfile(user.uid);
    await addTransaction(user.uid, {
      type: "purchase",
      amount: 0,
      balanceAfter: profile?.coins ?? 0,
      description: `Subscribed to Platinum (${plan.label})`,
      category: "platinum",
      amountNGN: plan.priceNGN,
      paystackRef: reference,
    });
    if (profile) await checkAndAwardAchievements(user.uid, profile);

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "subscribePlatinum", uid: user.uid, tier, reference });
    return {
      success: false,
      message: "Payment succeeded but activating Platinum failed — contact support with reference " + reference,
    };
  }
}

/* ---------------------------- Tipping ---------------------------- */

/** Deducts `coins` from the sender and credits 65% of it to the creator, logging both sides. */
export async function tipCreator(
  fromUserId: string,
  toCreatorId: string,
  coins: number,
  mangaId?: string
): Promise<PaymentResult> {
  if (coins <= 0) {
    return { success: false, message: "Enter a tip amount first." };
  }
  if (fromUserId === toCreatorId) {
    return { success: false, message: "You can't tip yourself." };
  }

  const sender = await getUserProfile(fromUserId);
  if (!sender || (sender.coins ?? 0) < coins) {
    return { success: false, message: "Not enough coins for this tip." };
  }

  const creator = await getUserProfile(toCreatorId);
  if (!creator) {
    return { success: false, message: "This creator isn't set up to receive tips yet." };
  }

  const creatorShare = Math.round(coins * 0.65 * 100) / 100;
  const senderBalance = sender.coins - coins;
  const creatorBalance = (creator.coins ?? 0) + creatorShare;

  try {
    await updateUserPrefs(fromUserId, { coins: senderBalance });
    await updateUserPrefs(toCreatorId, { coins: creatorBalance });

    await addTransaction(fromUserId, {
      type: "spend",
      amount: -coins,
      balanceAfter: senderBalance,
      description: `Tipped ${creator.displayName}`,
      category: "tip",
      ...(mangaId ? { relatedMangaId: mangaId } : {}),
    });
    await addTransaction(toCreatorId, {
      type: "reward",
      amount: creatorShare,
      balanceAfter: creatorBalance,
      description: `Tip received from ${sender.displayName}`,
      category: "tip",
      ...(mangaId ? { relatedMangaId: mangaId } : {}),
    });

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "tipCreator", fromUserId, toCreatorId, coins });
    return { success: false, message: "Couldn't complete the tip. Please try again." };
  }
}

/* ---------------------------- Daily roulette ---------------------------- */

/** The 8 wheel segments, clockwise from the top (index 0), in lockstep with CoinRoulette's own
 * SEGMENT_COLORS — shared here (rather than only in the component) so the backend award and the
 * wheel's visual landing spot can never drift apart: spinRoulette() below picks a segment INDEX,
 * not a free-floating amount, and the component animates to that exact index. */
export const ROULETTE_SEGMENT_VALUES = [0.5, 1, 0.5, 2, 0.5, 4, 1, 2] as const;

export interface RouletteResult {
  status: "spun" | "already_spun";
  coins?: number;
  balance?: number;
  /** Which of ROULETTE_SEGMENT_VALUES was won — the wheel animates to land exactly here. */
  segmentIndex?: number;
}

/** Once-per-day spin: a uniform-random segment (mostly-small-value segments outnumber the rare
 * 4-coin one 7:1 simply because there are more of them, matching this feature's original
 * "mostly 0.5-2, rarely up to 4" weighting without needing a separate probability table that
 * could fall out of sync with the segments actually drawn on the wheel). */
export async function spinRoulette(user: User): Promise<RouletteResult> {
  const profile = await getUserProfile(user.uid);
  const today = todayKey();

  if (profile?.lastRouletteSpin === today) {
    return { status: "already_spun" };
  }

  const segmentIndex = Math.floor(Math.random() * ROULETTE_SEGMENT_VALUES.length);
  const coinsWon = ROULETTE_SEGMENT_VALUES[segmentIndex];
  const newBalance = Math.round(((profile?.coins ?? 0) + coinsWon) * 10) / 10;

  await updateUserPrefs(user.uid, { coins: newBalance, lastRouletteSpin: today });
  await addTransaction(user.uid, {
    type: "reward",
    amount: coinsWon,
    balanceAfter: newBalance,
    description: "Daily roulette spin",
  });

  return { status: "spun", coins: coinsWon, balance: newBalance, segmentIndex };
}

/* ---------------------------- Reading streak ---------------------------- */

export interface StreakResult {
  streakCount: number;
  bonusAwarded: number;
  alreadyClaimedToday: boolean;
}

/** Marks today as read; extends the streak if yesterday was also read, else restarts it at 1. */
export async function claimStreak(user: User): Promise<StreakResult> {
  const profile = await getUserProfile(user.uid);
  const today = todayKey();
  const streakDays = profile?.streakDays ?? [];

  if (streakDays.includes(today)) {
    return { streakCount: streakDays.length, bonusAwarded: 0, alreadyClaimedToday: true };
  }

  const yesterday = todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const wasConsecutive = streakDays.includes(yesterday);
  const updatedDays = wasConsecutive ? [...streakDays, today] : [today];
  const streakCount = updatedDays.length;

  let bonusAwarded = 0;
  if (streakCount === 7) bonusAwarded = 10;
  else if (streakCount === 30) bonusAwarded = 50;

  const newBalance = (profile?.coins ?? 0) + bonusAwarded;

  await updateUserPrefs(user.uid, {
    streakDays: updatedDays,
    ...(bonusAwarded > 0 ? { coins: newBalance } : {}),
  });

  if (bonusAwarded > 0) {
    await addTransaction(user.uid, {
      type: "reward",
      amount: bonusAwarded,
      balanceAfter: newBalance,
      description: `${streakCount}-day streak bonus`,
    });
  }

  if (profile) {
    await checkAndAwardAchievements(user.uid, { ...profile, streakDays: updatedDays });
  }

  return { streakCount, bonusAwarded, alreadyClaimedToday: false };
}

/* ---------------------------- Coin-gated chapters ---------------------------- */

export async function isChapterUnlocked(uid: string, chapterId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "users", uid, "unlocked", chapterId));
  return snap.exists();
}

/** Deducts `price` coins and records the chapter as unlocked for this user. */
export async function purchaseChapterWithCoins(
  user: User,
  mangaId: string,
  chapterId: string,
  price: number
): Promise<PaymentResult> {
  const profile = await getUserProfile(user.uid);
  if (!profile || (profile.coins ?? 0) < price) {
    return { success: false, message: "Not enough coins to unlock this chapter." };
  }

  const newBalance = profile.coins - price;
  try {
    await updateUserPrefs(user.uid, { coins: newBalance });
    await setDoc(doc(db, "users", user.uid, "unlocked", chapterId), {
      mangaId,
      chapterId,
      unlockedAt: new Date().toISOString(),
    });

    await addTransaction(user.uid, {
      type: "spend",
      amount: -price,
      balanceAfter: newBalance,
      description: "Unlocked a chapter with coins",
      category: "chapter_unlock",
      relatedMangaId: mangaId,
      relatedChapterId: chapterId,
    });

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "purchaseChapterWithCoins", uid: user.uid, mangaId, chapterId });
    return { success: false, message: "Couldn't unlock this chapter. Please try again." };
  }
}
