/**
 * Server side of the rewarded-ads system (see lib/adConfig.ts for the rules). This has to run on the server:
 * coins and chapter unlocks are worth real money here, and anything the browser can write, a browser can
 * forge. Instead the browser only ASKS: `start` opens a session and remembers when it began, `claim` checks
 * that the ad's full length has really passed on the SERVER's clock, that this session is unclaimed and
 * belongs to the caller, and that the daily caps still hold — then applies the reward in the same
 * transaction that marks the session claimed, so a reward can never be paid twice.
 *
 * Documents (admin SDK only; the rules deny clients on all of them):
 *   adSessions/{sessionId}               { uid, purpose, chapterId?, mangaId?, startedAtMs, claimed }
 *   users/{uid}/adDaily/{YYYY-MM-DD}     the counters the caps are checked against (UTC day)
 */
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { AD_CONFIG, PLATINUM_BURSTS_PER_DAY, drawCoinReward, type AdPurpose, type AdStatus } from "@/lib/adConfig";
import { HttpError, adminDb } from "./firebaseAdmin";

const SESSION_MAX_AGE_MS = 10 * 60_000;

interface DailyDoc {
  coinAds?: number;
  coinsEarned?: number;
  chapterAds?: Record<string, number>;
  chaptersUnlocked?: string[];
  platinumAds?: number;
  platinumBursts?: number;
}

export function dayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function dailyRef(db: Firestore, uid: string, day = dayKey()): DocumentReference {
  return db.collection("users").doc(uid).collection("adDaily").doc(day);
}

export function toStatus(day: string, d: DailyDoc): AdStatus {
  return {
    day,
    coins: { watched: d.coinAds ?? 0, perDay: AD_CONFIG.coins.perDay, earned: d.coinsEarned ?? 0 },
    chapter: {
      unlockedToday: d.chaptersUnlocked?.length ?? 0,
      perDay: AD_CONFIG.chapter.chaptersPerDay,
      adsPerChapter: AD_CONFIG.chapter.adsPerChapter,
      progress: d.chapterAds ?? {},
    },
    platinum: {
      watched: d.platinumAds ?? 0,
      adsRequired: AD_CONFIG.platinum.adsRequired,
      adsPerDay: AD_CONFIG.platinum.adsPerDay,
      bursts: d.platinumBursts ?? 0,
      maxBursts: PLATINUM_BURSTS_PER_DAY,
    },
  };
}

export async function getAdStatus(uid: string): Promise<AdStatus> {
  const day = dayKey();
  const snap = await dailyRef(adminDb(), uid, day).get();
  return toStatus(day, (snap.data() as DailyDoc | undefined) ?? {});
}

/** Throws an HttpError if `purpose` can't be watched right now given today's counters. */
function assertCanWatch(d: DailyDoc, purpose: AdPurpose, chapterId: string | undefined, alreadyUnlocked: boolean, profile: Record<string, unknown>): void {
  if (purpose === "coins") {
    if ((d.coinAds ?? 0) >= AD_CONFIG.coins.perDay) throw new HttpError(429, `You've watched all ${AD_CONFIG.coins.perDay} coin ads for today — come back tomorrow.`);
  } else if (purpose === "chapter") {
    if (!chapterId) throw new HttpError(400, "Which chapter?");
    if (alreadyUnlocked || d.chaptersUnlocked?.includes(chapterId)) throw new HttpError(409, "That chapter is already unlocked.");
    if ((d.chaptersUnlocked?.length ?? 0) >= AD_CONFIG.chapter.chaptersPerDay) {
      throw new HttpError(429, `You've unlocked ${AD_CONFIG.chapter.chaptersPerDay} chapters with ads today — the limit resets tomorrow.`);
    }
    if ((d.chapterAds?.[chapterId] ?? 0) >= AD_CONFIG.chapter.adsPerChapter) throw new HttpError(409, "That chapter is already unlocked.");
  } else {
    if (profile.isPlatinum === true && profile.platinumTier !== "hourly") throw new HttpError(409, "You already have Platinum.");
    if ((d.platinumBursts ?? 0) >= PLATINUM_BURSTS_PER_DAY || (d.platinumAds ?? 0) >= AD_CONFIG.platinum.adsPerDay) {
      throw new HttpError(429, "You've used today's Platinum ads — come back tomorrow.");
    }
  }
}

export async function startAd(uid: string, purpose: AdPurpose, target?: { mangaId?: string; chapterId?: string }) {
  const db = adminDb();
  const [dailySnap, userSnap, unlockedSnap] = await Promise.all([
    dailyRef(db, uid).get(),
    db.collection("users").doc(uid).get(),
    purpose === "chapter" && target?.chapterId ? db.collection("users").doc(uid).collection("unlocked").doc(target.chapterId).get() : Promise.resolve(null),
  ]);
  if (userSnap.data()?.isPlatinum === true && purpose !== "platinum") throw new HttpError(409, "Platinum members never see ads.");
  assertCanWatch((dailySnap.data() as DailyDoc | undefined) ?? {}, purpose, target?.chapterId, !!unlockedSnap?.exists, userSnap.data() ?? {});

  const ref = db.collection("adSessions").doc();
  await ref.set({
    uid,
    purpose,
    ...(target?.chapterId ? { chapterId: target.chapterId } : {}),
    ...(target?.mangaId ? { mangaId: target.mangaId } : {}),
    startedAtMs: Date.now(),
    claimed: false,
  });
  return { sessionId: ref.id, seconds: AD_CONFIG.adSeconds };
}

export interface ClaimResult {
  purpose: AdPurpose;
  coinsAwarded?: number;
  chapterUnlocked?: boolean;
  chapterProgress?: number;
  platinumUnlocked?: boolean;
  platinumUntil?: string;
  platinumProgress?: number;
  status: AdStatus;
}

export async function claimAd(uid: string, sessionId: string): Promise<ClaimResult> {
  const db = adminDb();
  const sessionRef = db.collection("adSessions").doc(sessionId);
  const userRef = db.collection("users").doc(uid);
  const day = dayKey();
  const dRef = dailyRef(db, uid, day);

  return db.runTransaction(async (tx: Transaction) => {
    const [sessionSnap, dailySnap, userSnap] = await Promise.all([tx.get(sessionRef), tx.get(dRef), tx.get(userRef)]);
    const s = sessionSnap.data();
    if (!s || s.uid !== uid) throw new HttpError(404, "That ad session wasn't found.");
    if (s.claimed) throw new HttpError(409, "This ad was already counted.");
    const age = Date.now() - (s.startedAtMs as number);
    if (age > SESSION_MAX_AGE_MS) throw new HttpError(410, "That ad expired — start another.");
    if (age < (AD_CONFIG.adSeconds - 1) * 1000) throw new HttpError(425, "The ad hasn't finished yet.");

    const purpose = s.purpose as AdPurpose;
    const chapterId = s.chapterId as string | undefined;
    const d = ((dailySnap.data() as DailyDoc | undefined) ?? {}) as DailyDoc;
    const profile = userSnap.data() ?? {};
    const unlockedSnap = purpose === "chapter" && chapterId ? await tx.get(userRef.collection("unlocked").doc(chapterId)) : null;
    assertCanWatch(d, purpose, chapterId, !!unlockedSnap?.exists, profile);

    const result: Partial<ClaimResult> = {};
    const next: DailyDoc = { ...d };

    if (purpose === "coins") {
      const coins = drawCoinReward();
      const balance = (typeof profile.coins === "number" ? profile.coins : 0) + coins;
      tx.update(userRef, { coins: balance });
      tx.set(userRef.collection("transactions").doc(), {
        userId: uid,
        type: "reward",
        amount: coins,
        balanceAfter: balance,
        description: "Watched an ad",
        category: "ad_reward",
        createdAt: new Date().toISOString(),
      });
      next.coinAds = (d.coinAds ?? 0) + 1;
      next.coinsEarned = (d.coinsEarned ?? 0) + coins;
      result.coinsAwarded = coins;
    } else if (purpose === "chapter" && chapterId) {
      const watched = (d.chapterAds?.[chapterId] ?? 0) + 1;
      next.chapterAds = { ...(d.chapterAds ?? {}), [chapterId]: watched };
      result.chapterProgress = watched;
      if (watched >= AD_CONFIG.chapter.adsPerChapter) {
        tx.set(userRef.collection("unlocked").doc(chapterId), {
          unlockedVia: "ads",
          ...(s.mangaId ? { mangaId: s.mangaId } : {}),
          unlockedAt: new Date().toISOString(),
        });
        next.chaptersUnlocked = [...(d.chaptersUnlocked ?? []), chapterId];
        result.chapterUnlocked = true;
      }
    } else {
      const watched = (d.platinumAds ?? 0) + 1;
      next.platinumAds = watched;
      result.platinumProgress = watched;
      if (watched >= AD_CONFIG.platinum.adsRequired && (d.platinumBursts ?? 0) < PLATINUM_BURSTS_PER_DAY) {
        const current = profile.isPlatinum === true && typeof profile.platinumUntil === "string" ? new Date(profile.platinumUntil).getTime() : 0;
        const until = new Date(Math.max(Date.now(), current) + AD_CONFIG.platinum.hours * 3_600_000).toISOString();
        tx.update(userRef, { isPlatinum: true, platinumTier: "hourly", platinumUntil: until });
        next.platinumBursts = (d.platinumBursts ?? 0) + 1;
        result.platinumUnlocked = true;
        result.platinumUntil = until;
      }
    }

    tx.set(dRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(sessionRef, { claimed: true, claimedAtMs: Date.now() });
    return { purpose, ...result, status: toStatus(day, next) } as ClaimResult;
  });
}
