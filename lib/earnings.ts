/**
 * Creator earnings calculation — SERVER ONLY (uses firebase-admin; only ever imported by API
 * routes). Runs with admin privileges on purpose: figuring out what a creator earned means reading
 * OTHER users' transactions and reading history, which no client should be able to do. The
 * accountant dashboard and a creator's own PayoutTab both get their numbers from routes that call
 * this module, so every surface shows the same figures.
 *
 * Where each income stream comes from (all in [periodStart, periodEnd)):
 *  - Coin unlocks: readers' `chapter_unlock` transactions, attributed to whoever authored the
 *    series (`publishedSeries/{id}.authorId`). Imported titles have no author and earn nobody
 *    anything.
 *  - Tips: the creator's own `tip` reward transactions — already their 65% share in coins.
 *  - Ad revenue: `creatorAdRevenue/{period}_{uid}.grossNGN`. No ad network attributes revenue to
 *    creators yet (the Finance tab shows ads at ₦0), so this is 0 unless someone records it.
 *  - Platinum pool: PLATINUM_POOL_PERCENT of the period's Platinum revenue, split by each creator's
 *    share of ALL Platinum members' reads. "Platinum member" is judged by their CURRENT plan status
 *    (history records don't store the reader's plan at read time).
 * Rates and split percentages live in lib/earningsConfig.ts.
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./server/firebaseAdmin";
import { COIN_TO_NGN, CREATOR_SPLITS, PLATINUM_POOL_PERCENT, periodBounds, periodKeyOf } from "./earningsConfig";

export interface CreatorEarnings {
  uid: string;
  displayName: string;
  handle?: string;
  photoURL?: string;
  coinUnlocksCoins: number;
  tipsCoins: number;
  coinUnlocksNGN: number;
  tipsNGN: number;
  adRevenueNGN: number;
  platinumShareNGN: number;
  totalNetNGN: number;
  /** Revenue before the platform's cut (net amounts divided back by their split). */
  grossNGN: number;
  adjustmentNGN: number;
  finalPayoutNGN: number;
  payoutStatus: "pending";
  hasBankDetails: boolean;
  /** True when the account isn't a verified creator, so no cash earnings apply (see earnsMoney). */
  notEligible?: boolean;
  bankName?: string;
  accountLast4?: string;
  accountName?: string;
}

interface UserLite {
  uid: string;
  displayName: string;
  handle?: string;
  photoURL?: string;
  isPlatinum: boolean;
  isCreator: boolean;
  earnsMoney: boolean;
}

/** Policy update (superseding the earlier "Only verified creators earn" beta rule): every creator
 * or publisher earns cash, priced chapters, tips, and ad revenue alike, and can withdraw it —
 * verification no longer gates any of that. What verification actually changes now is entirely
 * elsewhere: higher reach in the For You algorithm, and the verified badge. Kept as its own
 * function (rather than inlining `isCreator || isPublisher` at every call site) so that if
 * eligibility ever needs a real carve-out again (e.g. an account under review), there's one place
 * to add it back. */
export function earnsMoney(u: Record<string, unknown>): boolean {
  return u.isFounder === true || u.isAdmin === true || u.isCreator === true || u.isPublisher === true;
}

/** Everything one period's calculation needs, fetched once and shared across every creator. */
export interface PeriodData {
  period: string;
  users: Map<string, UserLite>;
  seriesAuthor: Map<string, string>;
  /** creator uid -> coins spent unlocking their chapters. */
  unlockCoinsByCreator: Map<string, number>;
  /** creator uid -> coins received as (already 65%-split) tips. */
  tipCoinsByCreator: Map<string, number>;
  adRevenueByCreator: Map<string, number>;
  /** creator uid -> reads of their work by Platinum members. */
  platinumReadsByCreator: Map<string, number>;
  platinumReadsTotal: number;
  platinumPoolNGN: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadPeriodData(periodStart: Date, periodEnd: Date, db: Firestore = adminDb()): Promise<PeriodData> {
  const startISO = periodStart.toISOString();
  const endISO = periodEnd.toISOString();
  const period = periodKeyOf(periodStart);

  const [usersSnap, seriesSnap, txSnap, historySnap, adSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("publishedSeries").get(),
    db.collectionGroup("transactions").where("createdAt", ">=", startISO).where("createdAt", "<", endISO).get(),
    db.collectionGroup("history").where("readAt", ">=", startISO).where("readAt", "<", endISO).get(),
    db.collection("creatorAdRevenue").where("period", "==", period).get(),
  ]);

  const users = new Map<string, UserLite>();
  usersSnap.forEach((d) => {
    const u = d.data();
    users.set(d.id, {
      uid: d.id,
      displayName: (u.displayName as string) ?? "Unnamed",
      handle: u.handle as string | undefined,
      photoURL: u.photoURL as string | undefined,
      isPlatinum: u.isPlatinum === true,
      isCreator: u.isCreator === true || u.isPublisher === true,
      earnsMoney: earnsMoney(u),
    });
  });

  const seriesAuthor = new Map<string, string>();
  seriesSnap.forEach((d) => {
    const authorId = d.data().authorId as string | undefined;
    if (authorId) seriesAuthor.set(d.id, authorId);
  });

  const unlockCoinsByCreator = new Map<string, number>();
  const tipCoinsByCreator = new Map<string, number>();
  let platinumRevenueNGN = 0;
  txSnap.forEach((d: QueryDocumentSnapshot) => {
    const tx = d.data();
    if (tx.category === "chapter_unlock") {
      const creator = seriesAuthor.get(tx.relatedMangaId as string);
      // A creator unlocking their own chapter is coins moving between their own pockets, not income.
      if (creator && creator !== tx.userId) unlockCoinsByCreator.set(creator, (unlockCoinsByCreator.get(creator) ?? 0) + Math.abs(tx.amount as number));
    } else if (tx.category === "tip" && tx.type === "reward") {
      const creator = tx.userId as string;
      tipCoinsByCreator.set(creator, (tipCoinsByCreator.get(creator) ?? 0) + (tx.amount as number));
    } else if (tx.category === "platinum") {
      if (typeof tx.amountNGN === "number") platinumRevenueNGN += tx.amountNGN;
      else if (tx.type === "spend") platinumRevenueNGN += Math.abs(tx.amount as number) * COIN_TO_NGN; // paid with coins
    }
  });

  const platinumReadsByCreator = new Map<string, number>();
  let platinumReadsTotal = 0;
  historySnap.forEach((d) => {
    const readerUid = d.ref.parent.parent?.id;
    if (!readerUid || !users.get(readerUid)?.isPlatinum) return;
    const creator = seriesAuthor.get(d.data().mangaId as string);
    // Reading your own work isn't an audience — excluded from the pool entirely (numerator and
    // denominator), otherwise a Platinum creator could inflate their share by re-reading themselves.
    if (creator && creator === readerUid) return;
    platinumReadsTotal += 1;
    if (creator) platinumReadsByCreator.set(creator, (platinumReadsByCreator.get(creator) ?? 0) + 1);
  });

  const adRevenueByCreator = new Map<string, number>();
  adSnap.forEach((d) => {
    const { uid, grossNGN } = d.data();
    if (typeof uid === "string" && typeof grossNGN === "number") adRevenueByCreator.set(uid, grossNGN);
  });

  return {
    period,
    users,
    seriesAuthor,
    unlockCoinsByCreator,
    tipCoinsByCreator,
    adRevenueByCreator,
    platinumReadsByCreator,
    platinumReadsTotal,
    platinumPoolNGN: platinumRevenueNGN * PLATINUM_POOL_PERCENT,
  };
}

/** Every uid that could be owed money this period: flagged creators/publishers, series authors, and
 * anyone who received a tip — so a creator who earned but was never flagged isn't silently skipped. */
export function getAllCreatorUids(data: PeriodData): string[] {
  const uids = new Set<string>();
  data.users.forEach((u) => u.isCreator && uids.add(u.uid));
  data.seriesAuthor.forEach((author) => uids.add(author));
  data.tipCoinsByCreator.forEach((_, uid) => uids.add(uid));
  return Array.from(uids).filter((uid) => data.users.get(uid)?.earnsMoney === true);
}

/** Pure math for one creator against already-loaded period data. */
export function computeCreatorEarnings(data: PeriodData, uid: string): CreatorEarnings {
  const user = data.users.get(uid);
  if (user && !user.earnsMoney) {
    // Not a verified creator: nothing accrues. (Coins from tips/unlocks still land in their coin balance.)
    return {
      uid,
      displayName: user.displayName,
      handle: user.handle,
      photoURL: user.photoURL,
      coinUnlocksCoins: 0,
      tipsCoins: 0,
      coinUnlocksNGN: 0,
      tipsNGN: 0,
      adRevenueNGN: 0,
      platinumShareNGN: 0,
      totalNetNGN: 0,
      grossNGN: 0,
      adjustmentNGN: 0,
      finalPayoutNGN: 0,
      payoutStatus: "pending",
      hasBankDetails: false,
      notEligible: true,
    };
  }
  const coinUnlocksCoins = data.unlockCoinsByCreator.get(uid) ?? 0;
  const tipsCoins = data.tipCoinsByCreator.get(uid) ?? 0;
  const adGross = data.adRevenueByCreator.get(uid) ?? 0;
  const poolShareGross =
    data.platinumReadsTotal > 0 ? data.platinumPoolNGN * ((data.platinumReadsByCreator.get(uid) ?? 0) / data.platinumReadsTotal) : 0;

  const coinUnlocksGross = coinUnlocksCoins * COIN_TO_NGN;
  const coinUnlocksNGN = round2(coinUnlocksGross * CREATOR_SPLITS.coinUnlocks);
  // Tips are already the creator's 65% cut in coins — convert, don't re-split. Gross is derived back.
  const tipsNGN = round2(tipsCoins * COIN_TO_NGN);
  const tipsGross = tipsNGN / CREATOR_SPLITS.tips;
  const adRevenueNGN = round2(adGross * CREATOR_SPLITS.adRevenue);
  const platinumShareNGN = round2(poolShareGross * CREATOR_SPLITS.platinumPool);

  const totalNetNGN = round2(coinUnlocksNGN + tipsNGN + adRevenueNGN + platinumShareNGN);
  return {
    uid,
    displayName: user?.displayName ?? "Unknown",
    handle: user?.handle,
    photoURL: user?.photoURL,
    coinUnlocksCoins,
    tipsCoins,
    coinUnlocksNGN,
    tipsNGN,
    adRevenueNGN,
    platinumShareNGN,
    totalNetNGN,
    grossNGN: round2(coinUnlocksGross + tipsGross + adGross + poolShareGross),
    adjustmentNGN: 0,
    finalPayoutNGN: totalNetNGN,
    payoutStatus: "pending",
    hasBankDetails: false,
  };
}

async function attachBank(db: Firestore, earnings: CreatorEarnings): Promise<CreatorEarnings> {
  const snap = await db.collection("users").doc(earnings.uid).collection("payoutDetails").doc("bank").get();
  const bank = snap.data();
  if (!bank || bank.verified !== true) return earnings;
  return {
    ...earnings,
    hasBankDetails: true,
    bankName: bank.bankName as string,
    accountLast4: String(bank.accountNumber ?? "").slice(-4),
    accountName: bank.accountName as string,
  };
}

/** One creator's earnings for a period. */
export async function calculateCreatorEarnings(uid: string, periodStart: Date, periodEnd: Date): Promise<CreatorEarnings> {
  const db = adminDb();
  const data = await loadPeriodData(periodStart, periodEnd, db);
  return attachBank(db, computeCreatorEarnings(data, uid));
}

/** Every creator's earnings for a period, highest first. Loads the period's data ONCE rather than
 * once per creator — the collection-group scans are the expensive part. */
export async function calculateAllCreatorEarnings(periodStart: Date, periodEnd: Date): Promise<CreatorEarnings[]> {
  const db = adminDb();
  const data = await loadPeriodData(periodStart, periodEnd, db);
  const results = await Promise.all(getAllCreatorUids(data).map((uid) => attachBank(db, computeCreatorEarnings(data, uid))));
  return results.sort((a, b) => b.totalNetNGN - a.totalNetNGN);
}

export { periodBounds };
