/**
 * Beta feedback (instructed by Zamyilton): "Let's redo ads... Ads should now be strictly between chapters for
 * free users, all but popup ads, and yes videos especially... a watch ad to get coins feature (5 per day,
 * ranging from 1-10 coins at random, obviously rigged to give from 3-6 most times), also a watch 3 ads to
 * unlock the next chapter (2 chapters a day). Some other platinum features and coin features could be
 * solicited with ads in the same way (watch 3 ads; only 4 ads per day; etc)."
 *
 * The numbers live here, shared by the server routes that enforce them (app/api/ads/*) and the UI that shows
 * them, so the two can never disagree.
 */
export type AdPurpose = "coins" | "chapter" | "platinum";

export const AD_CONFIG = {
  /** How long each ad plays before it can be claimed. */
  adSeconds: 15,
  coins: {
    /** Watch-an-ad-for-coins: at most this many a day. */
    perDay: 5,
    /** [coins, weight] — 1–10 coins, but 3–6 win 32 draws in 40 (80%), so most rewards land there. */
    weights: [
      [1, 1],
      [2, 2],
      [3, 7],
      [4, 9],
      [5, 9],
      [6, 7],
      [7, 2],
      [8, 1],
      [9, 1],
      [10, 1],
    ] as ReadonlyArray<readonly [number, number]>,
  },
  chapter: {
    /** Ads to watch to unlock ONE ad-gated chapter… */
    adsPerChapter: 3,
    /** …and how many chapters can be unlocked this way in a day. */
    chaptersPerDay: 2,
  },
  platinum: {
    /** Watch this many ads to earn a short burst of Platinum… */
    adsRequired: 3,
    /** …with at most this many ads counted per day (so one burst a day)… */
    adsPerDay: 4,
    /** …lasting this long. */
    hours: 1,
  },
} as const;

/** How many Platinum bursts the daily ad cap allows (floor(4 / 3) = 1). */
export const PLATINUM_BURSTS_PER_DAY = Math.floor(AD_CONFIG.platinum.adsPerDay / AD_CONFIG.platinum.adsRequired);

/** A weighted random coin reward. `random` is injectable so it can be tested. */
export function drawCoinReward(random: () => number = Math.random): number {
  const total = AD_CONFIG.coins.weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [coins, weight] of AD_CONFIG.coins.weights) {
    roll -= weight;
    if (roll < 0) return coins;
  }
  return AD_CONFIG.coins.weights[AD_CONFIG.coins.weights.length - 1][0];
}

/** The state of a user's rewarded-ad day, as the API reports it. */
export interface AdStatus {
  day: string;
  coins: { watched: number; perDay: number; earned: number };
  chapter: { unlockedToday: number; perDay: number; adsPerChapter: number; progress: Record<string, number> };
  platinum: { watched: number; adsRequired: number; adsPerDay: number; bursts: number; maxBursts: number };
}
