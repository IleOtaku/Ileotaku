"use client";

import { useEffect, useState } from "react";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import { subscribeToPayoutRuns } from "@/lib/payouts";
import PayoutReviewModal from "./PayoutReviewModal";
import type { PayoutRun } from "@/types";

/** Super Admin Overview: one card per payout run an accountant has submitted and that's waiting on
 * approval. Renders nothing at all when there's nothing to approve. */
export default function PendingPayoutCard() {
  const [runs, setRuns] = useState<PayoutRun[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => subscribeToPayoutRuns(setRuns), []);

  const pending = runs.filter((r) => r.status === "pending_approval");
  const reviewing = runs.find((r) => r.id === reviewingId) ?? null;
  if (pending.length === 0 && !reviewing) return null;

  return (
    <>
      {pending.map((run) => (
        <div key={run.id} className="mb-6 rounded-2xl border border-gold/50 bg-gold/[0.07] p-5">
          <h3 className="font-cinzel text-lg text-gold">💰 Payout Approval Required</h3>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="font-noto text-sm text-text">
              <p>
                <span className="text-muted">Period:</span> {periodLabel(run.period)}
              </p>
              <p>
                <span className="text-muted">Creators:</span> {run.totalCreators}
              </p>
              <p>
                <span className="text-muted">Total:</span> <strong className="text-gold">{formatNGN(run.totalAmountNGN)}</strong>
              </p>
              {run.createdByName && (
                <p className="text-xs text-muted">
                  Submitted by {run.createdByName}
                  {run.submittedAt ? ` · ${new Date(run.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </p>
              )}
            </div>
            <button type="button" onClick={() => setReviewingId(run.id)} className="btn-primary text-sm">
              Review &amp; Approve
            </button>
          </div>
        </div>
      ))}
      <PayoutReviewModal run={reviewing?.status === "pending_approval" ? reviewing : null} onClose={() => setReviewingId(null)} />
    </>
  );
}
