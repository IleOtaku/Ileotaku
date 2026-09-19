"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Modal, Skeleton } from "@/components/ui";
import PayoutBreakdownTable, { RUN_STATUS_STYLE } from "@/components/admin/PayoutBreakdownTable";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import { subscribeToPayoutRuns } from "@/lib/payouts";
import type { PayoutRun } from "@/types";

/** Accountant → Payout History: every payout run ever prepared, newest month first. Click one for
 * its full per-creator breakdown. */
export default function PayoutHistoryTab() {
  const [runs, setRuns] = useState<PayoutRun[] | null>(null);
  const [selected, setSelected] = useState<PayoutRun | null>(null);

  useEffect(() => subscribeToPayoutRuns(setRuns), []);

  // Keep the open modal in step with live status changes (e.g. Processing -> Completed).
  const open = selected ? (runs?.find((r) => r.id === selected.id) ?? selected) : null;

  if (runs === null) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (runs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-muted2 p-8 text-center font-noto text-sm text-muted">
        No payout runs yet. Prepare one from the Creator Earnings tab.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {runs.map((r) => {
          const s = RUN_STATUS_STYLE[r.status];
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-bg4 bg-bg2 px-5 py-4 text-left transition-colors hover:border-gold/40"
              >
                <div>
                  <p className="font-syne text-sm font-semibold text-text">{periodLabel(r.period)}</p>
                  <p className="font-noto text-xs text-muted">
                    {r.totalCreators} creator{r.totalCreators === 1 ? "" : "s"} · prepared by {r.createdByName ?? "the accountant"} ·{" "}
                    {new Date(r.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-cinzel text-lg text-gold">{formatNGN(r.totalAmountNGN)}</span>
                  <span className={`rounded-full px-3 py-1 font-syne text-[11px] font-semibold ${s.className}`}>{s.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal open={!!open} onClose={() => setSelected(null)} title={open ? `${periodLabel(open.period)} payout` : undefined} widthClass="sm:max-w-5xl">
        {open && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 font-syne text-[11px] font-semibold ${RUN_STATUS_STYLE[open.status].className}`}>
                {RUN_STATUS_STYLE[open.status].label}
              </span>
              {open.approvedAt && (
                <span className="font-noto text-xs text-muted">Approved {new Date(open.approvedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              )}
              {(open.failedCount ?? 0) > 0 && <span className="font-noto text-xs text-red-400">{open.failedCount} transfer(s) failed</span>}
            </div>
            {open.accountantNotes && (
              <p className="rounded-xl bg-bg3 p-3 font-noto text-xs text-text">
                <span className="font-semibold text-muted">Accountant notes: </span>
                {open.accountantNotes}
              </p>
            )}
            {open.lastError && <p className="rounded-xl bg-red-500/10 p-3 font-noto text-xs text-red-300">Last error: {open.lastError}</p>}
            <PayoutBreakdownTable lines={open.creators} />
          </div>
        )}
      </Modal>
    </>
  );
}
