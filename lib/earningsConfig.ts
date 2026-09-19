/**
 * Creator-payout money constants, in one client-safe place (no server imports) so the accountant
 * UI, the server-side calculation in lib/earnings.ts, and the creator's own PayoutTab all agree.
 * Change a number here and every surface follows.
 */

/** What one coin is worth in Naira when converting coin-denominated creator income to cash.
 *
 * The payout spec suggested ₦15/coin, but at the new coin-pack prices a coin sells for ₦6 (50 coins
 * for ₦300) down to ~₦4 (880 coins for ₦3,500) — paying creators ₦15 x 70% = ₦10.50 per coin would
 * hand out more than the platform ever collected for that coin. ₦6, the price of a coin in the
 * smallest pack, is the highest a coin ever actually sold for, so payouts can't exceed revenue.
 * Raise it deliberately if that's what you want. */
export const COIN_TO_NGN = 6;

/** Creator's share of each income stream. Coin unlocks / tips / Platinum follow the payout spec;
 * NOTE these do not match the published Creator Agreement page (app/creator-agreement/page.tsx:
 * 70% unlocks, 85% tips, 60% Platinum pool, 0% feed ads) — reconcile one or the other before the
 * first real payout. */
export const CREATOR_SPLITS = {
  coinUnlocks: 0.7,
  /** Tips are ALREADY credited to the creator at this share when the tip is sent
   * (app/api/tip-creator/route.ts), so the tip transaction amount is used as-is, not re-split. */
  tips: 0.65,
  adRevenue: 0.6,
  platinumPool: 0.7,
} as const;

/** Share of a period's Platinum subscription revenue that goes into the creator pool, divided among
 * creators in proportion to Platinum members' reads of their work. Not defined anywhere in the
 * product spec — 30% is a placeholder to be confirmed. */
export const PLATINUM_POOL_PERCENT = 0.3;

export function formatNGN(amount: number): string {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/** "YYYY-MM" of a Date, in UTC — matches every stored createdAt ISO string. */
export function periodKeyOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** [start, end) of a "YYYY-MM" month in UTC. */
export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** The last `count` calendar months (most recent first), including the current one. */
export function recentPeriods(count = 6, from: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, i) =>
    periodKeyOf(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1)))
  );
}

export function periodLabel(period: string): string {
  const { start } = periodBounds(period);
  return start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
