"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calculator, Loader2, Save, Send, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui";
import PayoutBreakdownTable, { BankStatus, LineStatusBadge, RUN_STATUS_STYLE } from "@/components/admin/PayoutBreakdownTable";
import { useAuth } from "@/hooks/useAuth";
import { formatNGN, periodBounds, periodLabel, recentPeriods } from "@/lib/earningsConfig";
import {
  callApi,
  EDITABLE_STATUSES,
  getPayoutRun,
  isPayable,
  saveDraft,
  submitForApproval,
  summarizeLines,
  toPayoutLine,
  type EarningsRow,
} from "@/lib/payouts";
import type { CreatorPayoutLine, PayoutRun } from "@/types";

const PERIODS = recentPeriods(6);

interface CalcResponse {
  period: string;
  periodStart: string;
  periodEnd: string;
  creators: EarningsRow[];
}

/** Accountant → Creator Earnings: pick a month, calculate every creator's earnings (server-side),
 * adjust individual rows with a recorded reason, then save a draft or submit the run to the Super
 * Admin. A creator with no verified bank details is flagged red and excluded from the payable
 * total — they cannot be paid until they've saved and verified an account. */
export default function CreatorEarningsTab() {
  const { user, profile } = useAuth();
  const [period, setPeriod] = useState(PERIODS[1] ?? PERIODS[0]); // last full month by default
  const [run, setRun] = useState<PayoutRun | null | undefined>(undefined);
  const [lines, setLines] = useState<CreatorPayoutLine[] | null>(null);
  const [notes, setNotes] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const editable = !run || EDITABLE_STATUSES.includes(run.status);

  const loadRun = useCallback(async (p: string) => {
    setRun(undefined);
    setLines(null);
    setConfirmSubmit(false);
    try {
      const existing = await getPayoutRun(p);
      setRun(existing);
      if (existing) {
        setLines(existing.creators);
        setNotes(existing.accountantNotes ?? "");
      } else {
        setNotes("");
      }
    } catch {
      setRun(null);
      toast.error("Couldn't load this period's payout.");
    }
  }, []);

  useEffect(() => {
    loadRun(period);
  }, [period, loadRun]);

  async function handleCalculate() {
    if (!user) return;
    setCalculating(true);
    try {
      const res = await callApi<CalcResponse>(user, "/api/admin/earnings", { method: "POST", body: { period } });
      // Keep any adjustments already entered for a creator when re-calculating.
      const previous = new Map((lines ?? []).map((l) => [l.uid, l]));
      setLines(
        res.creators.map((row) => {
          const prev = previous.get(row.uid);
          return toPayoutLine(row, prev?.adjustmentNGN ?? 0, prev?.adjustmentReason);
        })
      );
      toast.success(`Calculated earnings for ${res.creators.length} creators.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't calculate earnings.");
    } finally {
      setCalculating(false);
    }
  }

  function updateAdjustment(uid: string, patch: { amount?: number; reason?: string }) {
    setLines((prev) =>
      (prev ?? []).map((l) => {
        if (l.uid !== uid) return l;
        const adjustmentNGN = patch.amount ?? l.adjustmentNGN;
        const adjustmentReason = patch.reason ?? l.adjustmentReason;
        return {
          ...l,
          adjustmentNGN,
          adjustmentReason,
          finalPayoutNGN: Math.round((l.totalNetNGN + adjustmentNGN) * 100) / 100,
        };
      })
    );
  }

  const problems = useMemo(() => {
    const out: string[] = [];
    for (const l of lines ?? []) {
      if (l.adjustmentNGN !== 0 && !l.adjustmentReason?.trim()) out.push(`${l.displayName}: add a reason for the adjustment.`);
      if (l.finalPayoutNGN < 0) out.push(`${l.displayName}: the adjustment takes their payout below ₦0.`);
    }
    return out;
  }, [lines]);

  const summary = summarizeLines(lines ?? []);
  const unpayable = (lines ?? []).filter((l) => !l.hasBankDetails && l.finalPayoutNGN > 0);

  function buildInput() {
    const { start, end } = periodBounds(period);
    return {
      period,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      lines: (lines ?? []).map((l) => ({ ...l, adjustmentReason: l.adjustmentReason?.trim() || undefined })),
      accountantNotes: notes,
      accountant: { uid: user!.uid, displayName: profile?.displayName },
    };
  }

  async function handleSave(kind: "draft" | "submit") {
    if (!user || !lines) return;
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    setBusy(kind);
    try {
      if (kind === "draft") {
        await saveDraft(buildInput());
        toast.success("Draft saved.");
      } else {
        await submitForApproval(buildInput());
        toast.success("Submitted — the Super Admin has been notified.");
      }
      setConfirmSubmit(false);
      await loadRun(period);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save this payout.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="earn-period" className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Period
          </label>
          <select id="earn-period" value={period} onChange={(e) => setPeriod(e.target.value)} className="input-base text-sm">
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleCalculate}
          disabled={calculating || !editable}
          className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
        >
          {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calculate Earnings
        </button>
        {run && (
          <span className={`rounded-full px-3 py-1.5 font-syne text-xs font-semibold ${RUN_STATUS_STYLE[run.status].className}`}>
            {RUN_STATUS_STYLE[run.status].label}
          </span>
        )}
      </div>

      {run?.status === "changes_requested" && run.reviewNotes && (
        <div className="rounded-xl border border-clay/40 bg-clay/10 p-4">
          <p className="font-syne text-xs font-semibold text-clay2">Super Admin requested changes</p>
          <p className="mt-1 font-noto text-sm text-text">{run.reviewNotes}</p>
        </div>
      )}
      {run && !editable && (
        <p className="rounded-xl border border-bg4 bg-bg2 p-4 font-noto text-sm text-muted">
          This period&apos;s payout is <strong className="text-text">{RUN_STATUS_STYLE[run.status].label.toLowerCase()}</strong> and can no longer be edited.
        </p>
      )}

      {run === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !lines ? (
        <p className="rounded-2xl border border-dashed border-muted2 p-8 text-center font-noto text-sm text-muted">
          Choose a month and press <strong>Calculate Earnings</strong> to see what each creator has earned.
        </p>
      ) : lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-muted2 p-8 text-center font-noto text-sm text-muted">
          No creators earned anything in {periodLabel(period)}.
        </p>
      ) : !editable ? (
        <PayoutBreakdownTable lines={lines} />
      ) : (
        <>
          {unpayable.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-noto text-xs text-red-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {unpayable.length} creator{unpayable.length === 1 ? "" : "s"} owed money ({unpayable.map((l) => l.displayName).join(", ")}) have no verified bank
              details and can&apos;t be paid until they add them under Creator Studio → Payout.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-bg4">
            <table className="w-full min-w-[1000px] border-collapse text-left">
              <thead>
                <tr className="border-b border-bg4 bg-bg3">
                  {["Creator", "Bank", "Coin unlocks", "Ad revenue", "Platinum pool", "Tips", "Adjustment (₦, ±)", "Final payout", "Status"].map((h) => (
                    <th key={h} className="p-2.5 font-syne text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.uid} className={`border-b border-bg4 last:border-0 ${l.hasBankDetails ? "" : "bg-red-500/10"}`}>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar uid={l.uid} photoURL={l.photoURL} displayName={l.displayName} size={30} />
                        <div className="min-w-0">
                          <p className="truncate font-syne text-xs font-semibold text-text">{l.displayName}</p>
                          {l.handle && <p className="truncate font-noto text-[11px] text-muted">@{l.handle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <BankStatus ok={l.hasBankDetails} />
                    </td>
                    <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.coinUnlocksNGN)}</td>
                    <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.adRevenueNGN)}</td>
                    <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.platinumShareNGN)}</td>
                    <td className="p-2.5 font-noto text-xs text-text">{formatNGN(l.tipsNGN)}</td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={l.adjustmentNGN === 0 ? "" : l.adjustmentNGN}
                        onChange={(e) => updateAdjustment(l.uid, { amount: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0 })}
                        placeholder="0"
                        aria-label={`Adjustment for ${l.displayName}`}
                        className="input-base w-24 text-xs"
                      />
                      {l.adjustmentNGN !== 0 && (
                        <input
                          value={l.adjustmentReason ?? ""}
                          onChange={(e) => updateAdjustment(l.uid, { reason: e.target.value })}
                          placeholder="Reason (required)"
                          aria-label={`Adjustment reason for ${l.displayName}`}
                          className={`input-base mt-1 w-40 text-xs ${l.adjustmentReason?.trim() ? "" : "border-red-500/60"}`}
                        />
                      )}
                    </td>
                    <td className={`p-2.5 font-syne text-xs font-bold ${isPayable(l) ? "text-gold" : "text-red-400"}`}>{formatNGN(l.finalPayoutNGN)}</td>
                    <td className="p-2.5">
                      <LineStatusBadge line={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-bg3">
                  <td colSpan={9} className="p-3 font-noto text-xs text-text">
                    <span className="mr-5">
                      Creators to pay: <strong>{summary.totalCreators}</strong> of {lines.length}
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

          <div>
            <label htmlFor="acct-notes" className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Notes for the Super Admin
            </label>
            <textarea
              id="acct-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Anything they should know before approving this payout..."
              className="input-base w-full resize-none text-sm"
            />
          </div>

          {problems.length > 0 && (
            <ul className="list-disc pl-5 font-noto text-xs text-red-300">
              {problems.slice(0, 4).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={busy !== null}
              className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-40"
            >
              {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Draft
            </button>

            {!confirmSubmit ? (
              <button
                type="button"
                onClick={() => setConfirmSubmit(true)}
                disabled={busy !== null || summary.totalCreators === 0 || problems.length > 0}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> Submit for Approval
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2">
                <span className="font-noto text-xs text-text">
                  Send {summary.totalCreators} creators / {formatNGN(summary.totalAmountNGN)} to the Super Admin? You won&apos;t be able to edit it after.
                </span>
                <button
                  type="button"
                  onClick={() => handleSave("submit")}
                  disabled={busy !== null}
                  className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-40"
                >
                  {busy === "submit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Confirm
                </button>
                <button type="button" onClick={() => setConfirmSubmit(false)} className="btn-ghost text-xs">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
