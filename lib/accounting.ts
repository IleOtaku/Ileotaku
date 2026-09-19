/**
 * Accountant-dashboard queries that read platform-wide money movement (client SDK — firestore.rules
 * lets any admin read the `transactions` collection group). Creator-earnings maths lives on the
 * server in lib/earnings.ts; this file is only the revenue side.
 */
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { COIN_TO_NGN, periodBounds, periodKeyOf } from "./earningsConfig";
import type { CoinTransaction } from "@/types";

export interface RevenueBreakdown {
  coinSalesNGN: number;
  platinumNGN: number;
  /** No ad network attributes revenue yet (see AdminFinanceTab) — always 0 until one is wired. */
  adsNGN: number;
  /** Coin-denominated spends, valued at COIN_TO_NGN — NOT cash received (the cash was counted when
   * the coins were bought), shown so the accountant can see where coins are being spent. */
  tipsCoinValueNGN: number;
  boostsCoinValueNGN: number;
  /** Cash actually collected via Paystack: coin packs + Platinum + ads. */
  cashRevenueNGN: number;
}

const empty = (): RevenueBreakdown => ({
  coinSalesNGN: 0,
  platinumNGN: 0,
  adsNGN: 0,
  tipsCoinValueNGN: 0,
  boostsCoinValueNGN: 0,
  cashRevenueNGN: 0,
});

export interface MonthlyRevenue {
  thisMonth: RevenueBreakdown;
  lastMonth: RevenueBreakdown;
  percentChange: number;
}

/** One collection-group query covering last month + this month, split into the two buckets. */
export async function getMonthlyRevenue(now: Date = new Date()): Promise<MonthlyRevenue> {
  const thisKey = periodKeyOf(now);
  const lastKey = periodKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const since = periodBounds(lastKey).start.toISOString();

  const snap = await getDocs(query(collectionGroup(db, "transactions"), where("createdAt", ">=", since)));
  const thisMonth = empty();
  const lastMonth = empty();

  snap.forEach((d) => {
    const tx = d.data() as CoinTransaction;
    const bucket = tx.createdAt.startsWith(thisKey) ? thisMonth : tx.createdAt.startsWith(lastKey) ? lastMonth : null;
    if (!bucket) return;
    if (tx.category === "coins" && tx.amountNGN) bucket.coinSalesNGN += tx.amountNGN;
    else if (tx.category === "platinum" && tx.amountNGN) bucket.platinumNGN += tx.amountNGN;
    else if (tx.category === "tip" && tx.type === "spend") bucket.tipsCoinValueNGN += Math.abs(tx.amount) * COIN_TO_NGN;
    else if (tx.category === "boost" && tx.type === "spend") bucket.boostsCoinValueNGN += Math.abs(tx.amount) * COIN_TO_NGN;
  });
  for (const b of [thisMonth, lastMonth]) b.cashRevenueNGN = b.coinSalesNGN + b.platinumNGN + b.adsNGN;

  const percentChange =
    lastMonth.cashRevenueNGN === 0
      ? thisMonth.cashRevenueNGN > 0
        ? 100
        : 0
      : Math.round(((thisMonth.cashRevenueNGN - lastMonth.cashRevenueNGN) / lastMonth.cashRevenueNGN) * 100);

  return { thisMonth, lastMonth, percentChange };
}
