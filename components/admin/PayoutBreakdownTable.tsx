"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatNGN } from "@/lib/earningsConfig";
import { isPayable, summarizeLines } from "@/lib/payouts";
import type { CreatorPayoutLine, PayoutRunStatus } from "@/types";

export const RUN_STATUS_STYLE: Record<PayoutRunStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-bg4 text-muted" },
  pending_approval: { label: "Pending approval", className: "bg-gold/15 text-gold" },
  changes_requested: { label: "Changes requested", className: "bg-clay/20 text-clay2" },
  approved: { label: "Approved", className: "bg-plat/15 text-plat" },
  processing: { label: "Processing", className: "bg-plat/15 text-plat" },
  completed: { label: "Completed", className: "bg-green/20 text-green2" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-400" },
};

export function LineStatusBadge({ line }: { line: CreatorPayoutLine }) {
  const map: Record<CreatorPayoutLine["status"], { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-bg4 text-muted" },
    processing: { label: "Processing", className: "bg-gold/15 text-gold" },
    paid: { label: "Paid", className: "bg-green/20 text-green2" },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-400" },
    skipped: { label: "Not paid", className: "bg-red-500/15 text-red-400" },
  };
  const s = map[line.status];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-syne text-[11px] font-semibold ${s.className}`}>{s.label}</span>;
}

export function BankStatus({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex items-center gap-1 whitespace-nowrap font-noto text-xs text-green2">
      <CheckCircle2 className="h-3.5 w-3.5" /> Verified
    </span>
  ) : (
    <span className="flex items-center gap-1 whitespace-nowrap font-noto text-xs text-red-400">
      <TriangleAlert className="h-3.5 w-3.5" /> Missing
    </span>
  );
}

/** Read-only per-creator breakdown of a payout run, with its summary footer. */
export default function PayoutBreakdownTable({ lines }: { lines: CreatorPayoutLine[] }) {
  const summary = summarizeLines(lines);
  return (
    <div className="overflow-x-auto rounded-xl border border-bg4">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-bg4 bg-bg3">
            {["Creator", "Bank", "Coin unlocks", "Ads", "Platinum pool", "Tips", "Adjustment", "Final payout", "Status"].map((h) => (
              <th key={h} className="p-2.5 font-syne text-[11px] font-semibold uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.uid} className={`border-b border-bg4 last:border-0 ${isPayable(l) ? "" : "bg-red-500/[0.06]"}`}>
              <td className="p-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar uid={l.uid} photoURL={l.photoURL} displayName={l.displayName} size={28} />
                  <div className="min-w-0">
                    <p className="truncate font-syne text-xs font-semibold text-text">{l.displayName}</p>
                    {l.handle && <p className="truncate font-noto text-[11px] text-muted">@{l.handle}</p>}
                  </div>
                </div>
              </td>
              <td className="p-2.5">
                <BankStatus ok={l.hasBankDetails} />
                {l.hasBankDetails && (
                  <p className="font-noto text-[10px] text-muted">
                    {l.bankName} ••{l.accountLast4}
                  </p>
                )}
              </td>
              <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.coinUnlocksNGN)}</td>
              <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.adRevenueNGN)}</td>
              <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.platinumShareNGN)}</td>
              <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.tipsNGN)}</td>
              <td className="p-2.5 font-noto text-xs text-text">
                {l.adjustmentNGN === 0 ? "—" : `${l.adjustmentNGN > 0 ? "+" : "−"}${formatNGN(Math.abs(l.adjustmentNGN))}`}
                {l.adjustmentReason && <p className="max-w-[160px] truncate text-[10px] text-muted">{l.adjustmentReason}</p>}
              </td>
              <td className="p-2.5 font-syne text-xs font-bold text-gold">{formatNGN(l.finalPayoutNGN)}</td>
              <td className="p-2.5">
                <LineStatusBadge line={l} />
                {l.failureReason && <p className="mt-0.5 max-w-[160px] text-[10px] text-red-400">{l.failureReason}</p>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-bg3">
            <td colSpan={9} className="p-3 font-noto text-xs text-text">
              <span className="mr-5">
                Creators paid: <strong>{summary.totalCreators}</strong>
              </span>
              <span className="mr-5">
                Total: <strong className="text-gold">{formatNGN(summary.totalAmountNGN)}</strong>
              </span>
              <span>
                Platform fee: <strong>{formatNGN(summary.platformFeeNGN)}</strong>
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
