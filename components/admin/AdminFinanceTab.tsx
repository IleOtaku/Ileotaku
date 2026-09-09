"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Loader2 } from "lucide-react";
import {
  getFinanceSummary,
  getPendingPayouts,
  getRecentTransactions,
  markPayoutPaid,
  transactionsToCsv,
  type FinanceSummary,
  type TransactionLogEntry,
} from "@/lib/admin";
import { Skeleton } from "@/components/ui";
import type { EarningsRecord } from "@/types";

function BreakdownBar({ label, amount, max, colorClass }: { label: string; amount: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.max(2, (amount / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-noto text-xs text-muted">
        <span>{label}</span>
        <span>₦{amount.toLocaleString()}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg3">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Full finance console: revenue summary, coin/Platinum/ad breakdown, pending creator payouts,
 * a 50-row transaction log, and a CSV export of that log. Shared by the Super Admin, Sub-Admin
 * and Accountant dashboards — Accountant renders this as its entire console. */
export default function AdminFinanceTab() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [payouts, setPayouts] = useState<EarningsRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getFinanceSummary(), getPendingPayouts(), getRecentTransactions(50)])
      .then(([s, p, t]) => {
        setSummary(s);
        setPayouts(p);
        setTransactions(t);
      })
      .catch(() => toast.error("Some finance data couldn't load."))
      .finally(() => setLoading(false));
  }, []);

  async function handleMarkPaid(earningId: string) {
    setPayingId(earningId);
    try {
      await markPayoutPaid(earningId);
      setPayouts((prev) => prev.filter((p) => p.id !== earningId));
      toast.success("Marked as paid.");
    } catch {
      toast.error("Couldn't update this payout.");
    } finally {
      setPayingId(null);
    }
  }

  function handleExportCsv() {
    const csv = transactionsToCsv(transactions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ileotaku-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const maxBreakdown = Math.max(summary.coinsNGN, summary.platinumNGN, 1);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
          <p className="font-noto text-xs text-muted">Total Revenue (All Time)</p>
          <p className="mt-2 font-cinzel text-2xl text-gold">₦{summary.totalAllTimeNGN.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
          <p className="font-noto text-xs text-muted">This Month</p>
          <p className="mt-2 font-cinzel text-2xl text-text">₦{summary.totalThisMonthNGN.toLocaleString()}</p>
          <p className={`mt-1 font-noto text-xs ${summary.percentChange >= 0 ? "text-green2" : "text-clay2"}`}>
            {summary.percentChange >= 0 ? "+" : ""}
            {summary.percentChange}% vs last month
          </p>
        </div>
        <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
          <p className="font-noto text-xs text-muted">Last Month</p>
          <p className="mt-2 font-cinzel text-2xl text-text">₦{summary.totalLastMonthNGN.toLocaleString()}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Revenue Breakdown</h3>
        <div className="flex flex-col gap-4">
          <BreakdownBar label="Coin Sales" amount={summary.coinsNGN} max={maxBreakdown} colorClass="bg-clay" />
          <BreakdownBar label="Platinum Subscriptions" amount={summary.platinumNGN} max={maxBreakdown} colorClass="bg-gold" />
          <BreakdownBar label="Ad Revenue" amount={0} max={maxBreakdown} colorClass="bg-muted2" />
        </div>
        <p className="mt-3 font-noto text-[11px] text-muted">
          Ad revenue isn&apos;t wired to a network yet — shown at ₦0 until that integration exists.
        </p>
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Pending Creator Payouts</h3>
        {payouts.length === 0 ? (
          <p className="font-noto text-sm text-muted">No pending payouts.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-bg3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-syne text-sm font-semibold text-text">{p.creatorName}</p>
                  <p className="font-noto text-xs text-muted">{p.period}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-cinzel text-sm text-gold">₦{p.amount.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => handleMarkPaid(p.id)}
                    disabled={payingId === p.id}
                    className="btn-ghost text-xs disabled:opacity-50"
                  >
                    {payingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark as Paid"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-syne text-sm font-semibold text-text">Transaction Log</h3>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={transactions.length === 0}
            className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
        {transactions.length === 0 ? (
          <p className="font-noto text-sm text-muted">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-bg4">
                  {["Date", "Type", "Amount (NGN)", "User", "Reference"].map((h) => (
                    <th key={h} className="p-2.5 font-syne text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-bg4 last:border-0">
                    <td className="whitespace-nowrap p-2.5 font-noto text-xs text-muted">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2.5 font-noto text-xs text-text">{t.category ?? t.type}</td>
                    <td className="p-2.5 font-noto text-xs text-text">
                      {t.amountNGN ? `₦${t.amountNGN.toLocaleString()}` : "—"}
                    </td>
                    <td className="max-w-[180px] truncate p-2.5 font-noto text-xs text-muted">{t.userEmail ?? "—"}</td>
                    <td className="max-w-[160px] truncate p-2.5 font-noto text-[11px] text-muted">{t.paystackRef ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
