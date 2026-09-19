"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getMonthlyRevenue, type MonthlyRevenue } from "@/lib/accounting";
import { COIN_TO_NGN, formatNGN, periodKeyOf } from "@/lib/earningsConfig";
import { callApi, subscribeToPayoutRuns } from "@/lib/payouts";
import type { PayoutRun } from "@/types";

interface EarningsSummary {
  creators: { totalNetNGN: number; hasBankDetails: boolean }[];
}

function Stat({ label, value, sub, subClass }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <p className="font-noto text-xs text-muted">{label}</p>
      <p className="mt-2 font-cinzel text-2xl text-text">{value}</p>
      {sub && <p className={`mt-1 font-noto text-xs ${subClass ?? "text-muted"}`}>{sub}</p>}
    </div>
  );
}

function Bar({ label, amount, max, color, note }: { label: string; amount: number; max: number; color: string; note?: string }) {
  const pct = max > 0 ? Math.max(amount > 0 ? 2 : 0, (amount / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-noto text-xs text-muted">
        <span>
          {label}
          {note && <span className="ml-1.5 text-[10px] text-muted2">{note}</span>}
        </span>
        <span>{formatNGN(amount)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg3">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Accountant → Overview: this month vs last month, what's owed to creators, the platform's profit
 * after those obligations, a revenue breakdown, and how many creators are actually payable. */
export default function AccountantOverviewTab() {
  const { user } = useAuth();
  const [revenue, setRevenue] = useState<MonthlyRevenue | null>(null);
  const [runs, setRuns] = useState<PayoutRun[] | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMonthlyRevenue()
      .then(setRevenue)
      .catch(() => setError(true));
    return subscribeToPayoutRuns(setRuns);
  }, []);

  // Creator obligations for the month so far — same server calculation the Creator Earnings tab uses.
  useEffect(() => {
    if (!user) return;
    callApi<EarningsSummary>(user, "/api/admin/earnings", { method: "POST", body: { period: periodKeyOf(new Date()) } })
      .then(setEarnings)
      .catch(() => setEarnings(null));
  }, [user]);

  if (error) return <p className="font-noto text-sm text-clay2">Couldn&apos;t load revenue. Refresh to try again.</p>;
  if (!revenue || runs === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const { thisMonth, lastMonth, percentChange } = revenue;
  const pendingRuns = runs.filter((r) => ["pending_approval", "approved", "processing"].includes(r.status));
  const pendingPayoutsNGN = pendingRuns.reduce((s, r) => s + r.totalAmountNGN, 0);

  const creatorOwedNGN = earnings ? earnings.creators.reduce((s, c) => s + c.totalNetNGN, 0) : null;
  const profitNGN = creatorOwedNGN === null ? null : thisMonth.cashRevenueNGN - creatorOwedNGN;
  const totalCreators = earnings?.creators.length ?? null;
  const withBank = earnings?.creators.filter((c) => c.hasBankDetails).length ?? null;
  const active = earnings?.creators.filter((c) => c.totalNetNGN > 0).length ?? null;
  const up = percentChange >= 0;

  const max = Math.max(thisMonth.coinSalesNGN, thisMonth.platinumNGN, thisMonth.adsNGN, thisMonth.tipsCoinValueNGN, thisMonth.boostsCoinValueNGN, 1);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Revenue this month"
          value={formatNGN(thisMonth.cashRevenueNGN)}
          sub={`${up ? "+" : ""}${percentChange}% vs last month (${formatNGN(lastMonth.cashRevenueNGN)})`}
          subClass={up ? "text-green2" : "text-clay2"}
        />
        <Stat
          label="Pending creator payouts"
          value={formatNGN(pendingPayoutsNGN)}
          sub={pendingRuns.length ? `${pendingRuns.length} run${pendingRuns.length === 1 ? "" : "s"} awaiting / in transfer` : "Nothing pending"}
        />
        <Stat
          label="Platform profit (est.)"
          value={profitNGN === null ? (earnings === undefined ? "…" : "—") : formatNGN(profitNGN)}
          sub={creatorOwedNGN === null ? "Creator earnings unavailable" : `after ${formatNGN(creatorOwedNGN)} owed to creators`}
          subClass={profitNGN !== null && profitNGN < 0 ? "text-clay2" : undefined}
        />
        <div className="flex items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-4">
          {up ? <TrendingUp className="h-8 w-8 text-green2" /> : <TrendingDown className="h-8 w-8 text-clay2" />}
          <div>
            <p className="font-noto text-xs text-muted">Last month</p>
            <p className="font-cinzel text-xl text-text">{formatNGN(lastMonth.cashRevenueNGN)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active creators" value={active === null ? "…" : String(active)} sub="earned something this month" />
        <Stat label="With bank details" value={withBank === null ? "…" : String(withBank)} sub={totalCreators === null ? undefined : `of ${totalCreators} creators`} subClass="text-green2" />
        <Stat
          label="Without bank details"
          value={withBank === null || totalCreators === null ? "…" : String(totalCreators - withBank)}
          sub="can't be paid yet"
          subClass={totalCreators !== null && withBank !== null && totalCreators - withBank > 0 ? "text-red-400" : undefined}
        />
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Revenue breakdown — this month</h3>
        <div className="flex flex-col gap-4">
          <Bar label="Coin sales" amount={thisMonth.coinSalesNGN} max={max} color="bg-clay" />
          <Bar label="Platinum" amount={thisMonth.platinumNGN} max={max} color="bg-gold" />
          <Bar label="Ads" amount={thisMonth.adsNGN} max={max} color="bg-muted2" note="no ad network wired yet" />
          <Bar label="Tips" amount={thisMonth.tipsCoinValueNGN} max={max} color="bg-green2" note="coin value, not cash" />
          <Bar label="Boosts" amount={thisMonth.boostsCoinValueNGN} max={max} color="bg-plat" note="coin value, not cash" />
        </div>
        <p className="mt-4 font-noto text-[11px] text-muted">
          Revenue counts real money only (coin packs + Platinum + ads). Tips and boosts are coins already paid for, valued here at ₦{COIN_TO_NGN}/coin so you can see where they&apos;re being spent.
        </p>
      </section>
    </div>
  );
}
