import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateUserPrefs } from "./firestore";
import type { UserProfile } from "@/types";

const MANGA_STATS = "mangaStats";

/** How many chapters (1-indexed) every imported title gives away for free, regardless of
 * engagement tier — chapterIndex is 0-based, so index 0..FREE_CHAPTER_COUNT-1 covers chapters
 * 1..FREE_CHAPTER_COUNT. */
const FREE_CHAPTER_COUNT = 7;

export type EngagementTier = "low" | "medium" | "high" | "viral";

export interface MangaStats {
  totalReads: number;
  engagementTier: EngagementTier;
  source?: string;
}

/** Checked highest-first so a read count is classified by the topmost threshold it clears. */
const TIER_THRESHOLDS: { tier: EngagementTier; min: number }[] = [
  { tier: "viral", min: 10000 },
  { tier: "high", min: 1000 },
  { tier: "medium", min: 100 },
  { tier: "low", min: 0 },
];

/** Pure classification — no I/O — so trackMangaRead() can compute a fresh tier from a read count
 * it already has in hand without a second round-trip to Firestore. */
export function tierForReads(totalReads: number): EngagementTier {
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (totalReads >= min) return tier;
  }
  return "low";
}

function toStats(data: Record<string, unknown> | undefined): MangaStats {
  const totalReads = (data?.totalReads as number) ?? 0;
  return {
    totalReads,
    // Trust a stored `engagementTier` if present (cheaper than recomputing on every read), but
    // fall back to deriving it from `totalReads` for any doc written before this field existed.
    engagementTier: (data?.engagementTier as EngagementTier | undefined) ?? tierForReads(totalReads),
    source: data?.source as string | undefined,
  };
}

/** Fetches one manga's engagement stats. Returns "low"-equivalent zeros (not null) for a manga
 * with no `mangaStats` doc yet, since an untracked title has by definition had no reads and
 * should behave exactly like a real low-engagement one everywhere this is consulted. */
export async function getMangaStats(mangaId: string): Promise<MangaStats> {
  try {
    const snap = await getDoc(doc(db, MANGA_STATS, mangaId));
    return snap.exists() ? toStats(snap.data()) : { totalReads: 0, engagementTier: "low" };
  } catch (error) {
    await logError(error, { operation: "contentLocking.getMangaStats", mangaId });
    return { totalReads: 0, engagementTier: "low" };
  }
}

/** Fetches stats for several titles at once (e.g. to filter an Explore grid) — plain
 * `Promise.all` over individual reads rather than a `documentId() in [...]` query, since callers
 * here only ever need a handful of ids (a page of cards), not the 30-id batch a real `in` query
 * would justify. */
export async function getMangaStatsBatch(mangaIds: string[]): Promise<Record<string, MangaStats>> {
  const entries = await Promise.all(mangaIds.map(async (id) => [id, await getMangaStats(id)] as const));
  return Object.fromEntries(entries);
}

/** mangaIds whose stored `engagementTier` is one of `tiers`, newest-stats-doc-first is not
 * guaranteed (Firestore's `in` query has no implicit order) — used by Explore's Platinum
 * Exclusives rail (high/viral) and could equally power a "Free to Read"-style live query. */
export async function getMangaIdsByTier(tiers: EngagementTier[], count = 6): Promise<string[]> {
  if (tiers.length === 0) return [];
  try {
    const q = query(collection(db, MANGA_STATS), where("engagementTier", "in", tiers), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.id);
  } catch (error) {
    await logError(error, { operation: "contentLocking.getMangaIdsByTier", tiers });
    return [];
  }
}

/** Reads `totalReads` from `mangaStats/{mangaId}` and classifies it into a tier. A title with no
 * stats doc yet (nobody has read it through the tracked flow) is "low", the same tier a real
 * sub-100-read title gets — both mean "no lock beyond the free chapters". */
export async function getEngagementTier(mangaId: string): Promise<EngagementTier> {
  const stats = await getMangaStats(mangaId);
  return stats.engagementTier;
}

export type LockReason = "free" | "platinum" | "creator" | "low_engagement" | "ad" | "coins";

export interface LockConfig {
  locked: boolean;
  reason: LockReason;
  /** Only set when `reason === "ad"`. */
  adRequired?: boolean;
  /** Only set when `reason === "coins"`. */
  coinPrice?: number;
}

/**
 * The single source of truth for whether one chapter of one manga is locked, and why. Checked in
 * this exact order (each one short-circuits the rest):
 *   1. A Platinum member never sees a lock, anywhere.
 *   2. Creator-uploaded and African-original content ("creator"/"african" sources) is priced
 *      per-chapter by its own author (Sprint 9f's Add Chapter flow) rather than by engagement
 *      tier — `creatorChapterCoinPrice` is that chapter's own coinPrice field, 0 for a free one.
 *   3. The first 7 chapters of everything else are always free, regardless of tier.
 *   4. Everything remaining is an imported title beyond its free chapters: low engagement stays
 *      free, medium requires watching an ad, high/viral require coins (viral costs more, since
 *      it's also the content readers are most likely to already want badly enough to pay for).
 */
export async function getLockConfig(
  mangaId: string,
  chapterIndex: number,
  source: string | undefined,
  userProfile: Pick<UserProfile, "isPlatinum"> | null | undefined,
  creatorChapterCoinPrice?: number
): Promise<LockConfig> {
  if (userProfile?.isPlatinum) return { locked: false, reason: "platinum" };
  if (source === "creator" || source === "african") {
    if (creatorChapterCoinPrice && creatorChapterCoinPrice > 0) {
      return { locked: true, reason: "coins", coinPrice: creatorChapterCoinPrice };
    }
    return { locked: false, reason: "creator" };
  }
  if (chapterIndex < FREE_CHAPTER_COUNT) return { locked: false, reason: "free" };

  const tier = await getEngagementTier(mangaId);
  switch (tier) {
    case "low":
      return { locked: false, reason: "low_engagement" };
    case "medium":
      return { locked: true, reason: "ad", adRequired: true };
    case "high":
      return { locked: true, reason: "coins", coinPrice: 10 };
    case "viral":
      return { locked: true, reason: "coins", coinPrice: 20 };
  }
}

export interface UnlockResult {
  success: boolean;
  message?: string;
}

/** Records an ad-gated chapter as unlocked once the simulated ad has finished (or been skipped
 * past its 5-second minimum) — no coin cost, so there's nothing to check or deduct first. */
export async function unlockChapterWithAd(uid: string, mangaId: string, chapterId: string): Promise<UnlockResult> {
  try {
    await setDoc(doc(db, "users", uid, "unlocked", chapterId), {
      unlockedVia: "ad",
      mangaId,
      unlockedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    await logError(error, { operation: "contentLocking.unlockChapterWithAd", uid, mangaId, chapterId });
    return { success: false, message: "Couldn't unlock this chapter. Please try again." };
  }
}

/** Deducts `coinPrice` coins and records the chapter as unlocked. Mirrors
 * lib/payments.ts's purchaseChapterWithCoins (same balance-check-then-deduct shape, same
 * "chapter_unlock" transaction category, since both ultimately spend coins on the same
 * users/{uid}/unlocked/{chapterId} record) — kept as a separate function here rather than
 * reused because this one's unlock document carries the `unlockedVia`/`coinsSpent` shape this
 * sprint's ImportedContentGate expects. */
export async function unlockChapterWithCoins(
  uid: string,
  mangaId: string,
  chapterId: string,
  coinPrice: number
): Promise<UnlockResult> {
  try {
    const profile = await getUserProfile(uid);
    if (!profile || (profile.coins ?? 0) < coinPrice) {
      return { success: false, message: "Not enough coins to unlock this chapter." };
    }

    const newBalance = profile.coins - coinPrice;
    await updateUserPrefs(uid, { coins: newBalance });
    await setDoc(doc(db, "users", uid, "unlocked", chapterId), {
      unlockedVia: "coins",
      coinsSpent: coinPrice,
      mangaId,
      unlockedAt: serverTimestamp(),
    });

    // Best-effort — the unlock itself already succeeded above; a missed ledger entry shouldn't
    // undo it, only weaken the Finance dashboard's revenue rollup for this one spend.
    try {
      await addDoc(collection(db, "users", uid, "transactions"), {
        userId: uid,
        type: "spend",
        amount: -coinPrice,
        balanceAfter: newBalance,
        description: "Unlocked a chapter with coins",
        category: "chapter_unlock",
        relatedMangaId: mangaId,
        relatedChapterId: chapterId,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal, see comment above.
    }

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "contentLocking.unlockChapterWithCoins", uid, mangaId, chapterId, coinPrice });
    return { success: false, message: "Couldn't unlock this chapter. Please try again." };
  }
}

/** Whether `chapterId` has already been unlocked for this user, by any means (ad, coins, or the
 * pre-Sprint-9c purchaseChapterWithCoins flow — all three write to the same
 * users/{uid}/unlocked/{chapterId} document, so unlocking via one counts for all). */
export async function isChapterUnlocked(uid: string, chapterId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "users", uid, "unlocked", chapterId));
    return snap.exists();
  } catch (error) {
    await logError(error, { operation: "contentLocking.isChapterUnlocked", uid, chapterId });
    return false;
  }
}

/** Fire-and-forget read counter, called once per successfully-loaded chapter of an imported
 * title. Creates the stats doc on a title's first tracked read; otherwise atomically increments
 * `totalReads` and, in the same write, recomputes `engagementTier` from the *pre-increment*
 * count (the increment itself needs no round-trip to confirm, so recomputing from `current + 1`
 * here — rather than reading the post-increment value back — avoids one extra request per read
 * at the cost of the tier occasionally lagging by one read under concurrent traffic, which is
 * immaterial for a tier that only changes behavior at 100/1000/10000-read boundaries). Never
 * throws into the UI — a missed read count is a lost analytics point, not a broken page. */
export async function trackMangaRead(mangaId: string, source?: string): Promise<void> {
  try {
    const ref = doc(db, MANGA_STATS, mangaId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        totalReads: 1,
        engagementTier: tierForReads(1),
        ...(source ? { source } : {}),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const current = (snap.data().totalReads as number) ?? 0;
    await updateDoc(ref, {
      totalReads: increment(1),
      engagementTier: tierForReads(current + 1),
      ...(source ? { source } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "contentLocking.trackMangaRead", mangaId, source });
  }
}
