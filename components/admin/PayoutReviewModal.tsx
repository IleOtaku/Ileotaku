"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, TriangleAlert, Wallet } from "lucide-react";
import { Modal } from "@/components/ui";
import PayoutBreakdownTable from "@/components/admin/PayoutBreakdownTable";
import { useAuth } from "@/hooks/useAuth";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import { approveAndSend, callApi, requestChanges } from "@/lib/payouts";
import type { PayoutRun } from "@/types";

/** Super Admin's review of a submitted payout run: the full read-only breakdown, the accountant's
 * notes, and the LIVE Paystack balance (fetched every time this opens) with a warning if it can't
 * cover the run. "Approve & Send" needs a second, explicit confirmation; "Request Changes" sends the
 * run back to the accountant with a note. The actual sending happens server-side. */
export default function PayoutReviewModal({ run, onClose }: { run: PayoutRun | null; onClose: () => void }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"send" | "changes" | null>(null);

  useEffect(() => {
    if (!run || !user) return;
    setBalance(undefined);
    setConfirming(false);
    setChangesOpen(false);
    setNote("");
    callApi<{ balanceNGN: number }>(user, "/api/paystack/balance")
      .then((res) => setBalance(res.balanceNGN))
      .catch(() => setBalance(null));
  }, [run?.id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const insufficient = run && typeof balance === "number" && balance < run.totalAmountNGN;
  const ownRun = !!run && !!user && run.createdBy === user.uid;

  async function handleSend() {
    if (!run || !user) return;
    setBusy("send");
    try {
      const res = await approveAndSend(user, run.period);
      toast.success(
        res.failed > 0
          ? `Sent ${res.sent} payouts — ${res.failed} failed, check the run for details.`
          : `Payouts sent to ${res.sent} creators (${formatNGN(res.totalNGN)}).`
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send payouts.");
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  async function handleRequestChanges() {
    if (!run || !user) return;
    if (!note.trim()) {
      toast.error("Tell the accountant what to change.");
      return;
    }
    setBusy("changes");
    try {
      await requestChanges(run.period, note, user.uid);
      toast.success("Sent back to the accountant.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send it back.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={!!run} onClose={busy ? () => {} : onClose} title={run ? `Review ${periodLabel(run.period)} payout` : undefined} widthClass="sm:max-w-5xl">
      {run && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-bg3 p-3">
              <p className="font-noto text-[11px] text-muted">Total to send</p>
              <p className="font-cinzel text-xl text-gold">{formatNGN(run.totalAmountNGN)}</p>
            </div>
            <div className="rounded-xl bg-bg3 p-3">
              <p className="font-noto text-[11px] text-muted">Creators</p>
              <p className="font-cinzel text-xl text-text">{run.totalCreators}</p>
            </div>
            <div className={`rounded-xl p-3 ${insufficient ? "bg-red-500/15" : "bg-bg3"}`}>
              <p className="flex items-center gap-1 font-noto text-[11px] text-muted">
                <Wallet className="h-3 w-3" /> Paystack balance (live)
              </p>
              <p className={`font-cinzel text-xl ${insufficient ? "text-red-400" : "text-text"}`}>
                {balance === undefined ? <Loader2 className="h-5 w-5 animate-spin text-muted" /> : balance === null ? "Unavailable" : formatNGN(balance)}
              </p>
            </div>
          </div>

          {insufficient && typeof balance === "number" && (
            <p className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 font-noto text-xs text-red-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Insufficient balance: Paystack has {formatNGN(balance)} but this payout needs {formatNGN(run.totalAmountNGN)}. Top up your Paystack balance before approving — sending will be refused until then.
            </p>
          )}
          {balance === null && (
            <p className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3 font-noto text-xs text-gold">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Couldn&apos;t read the Paystack balance. Sending re-checks it on the server and will refuse if it&apos;s too low.
            </p>
          )}
          {ownRun && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 font-noto text-xs text-gold">
              You prepared this payout yourself, so someone else has to approve it.
            </p>
          )}

          {run.accountantNotes && (
            <p className="rounded-xl bg-bg3 p-3 font-noto text-xs text-text">
              <span className="font-semibold text-muted">Accountant notes: </span>
              {run.accountantNotes}
            </p>
          )}
          {run.lastError && <p className="rounded-xl bg-red-500/10 p-3 font-noto text-xs text-red-300">Last send attempt: {run.lastError}</p>}

          <PayoutBreakdownTable lines={run.creators} />

          {changesOpen ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="changes-note" className="font-syne text-xs font-semibold text-muted">
                What should the accountant change?
              </label>
              <textarea id="changes-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} className="input-base w-full resize-none text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={handleRequestChanges} disabled={busy !== null} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                  {busy === "changes" && <Loader2 className="h-4 w-4 animate-spin" />} Send back
                </button>
                <button type="button" onClick={() => setChangesOpen(false)} className="btn-ghost text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : confirming ? (
            <div className="flex flex-col gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4">
              <p className="font-noto text-sm text-text">
                This will send <strong className="text-gold">{formatNGN(run.totalAmountNGN)}</strong> to <strong>{run.totalCreators}</strong> creators through Paystack. Transfers can&apos;t be recalled once sent.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleSend} disabled={busy !== null || !!insufficient} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                  {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" />} Yes, send payouts
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy !== null} className="btn-ghost text-sm">
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setChangesOpen(true)} className="btn-ghost text-sm">
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!!insufficient || ownRun || run.status !== "pending_approval"}
                className="btn-primary text-sm disabled:opacity-40"
              >
                Approve &amp; Send Payouts
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
