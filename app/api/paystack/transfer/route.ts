import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authenticate, adminDb, handle, HttpError } from "@/lib/server/firebaseAdmin";
import { deriveRunStatus, notifyUser, transferReference } from "@/lib/server/payoutHelpers";
import { fromKobo, paystack, toKobo } from "@/lib/server/paystackServer";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import type { CreatorPayoutLine, PayoutRun } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Paystack accepts at most 100 transfers per bulk request. */
const BULK_LIMIT = 100;
/** A run left in "approved" this long (a crashed request) may be picked up again. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

interface BulkItem {
  reference?: string;
  recipient?: string;
  transfer_code?: string;
  status?: string;
}

/** POST { payoutId } — a Super Admin approves a payout run and sends it.
 *
 * Who is calling comes from the verified ID token, NOT the request body (the spec'd `adminUid` field
 * would let anyone claim to be an admin); the caller must be a Super Admin, and cannot be the
 * accountant who prepared the run (two people must be involved in moving money).
 *
 * Safety properties: the run is claimed atomically (pending_approval -> approved) so two clicks can't
 * both send; transfer references are deterministic so a retry can never pay twice; only creators with
 * verified bank details are paid, from a server-side re-read of their payoutDetails; and the amount
 * actually sent is never more than the total the run was approved for. */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "super");
    const { payoutId } = (await request.json().catch(() => ({}))) as { payoutId?: string };
    if (!payoutId || typeof payoutId !== "string" || payoutId.includes("/")) throw new HttpError(400, "Missing payout.");

    const db = adminDb();
    const ref = db.collection("payouts").doc(payoutId);
    const now = new Date().toISOString();

    // 1. Claim.
    const run = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "Payout not found.");
      const data = { id: snap.id, ...snap.data() } as PayoutRun;
      const staleApproved = data.status === "approved" && Date.now() - new Date(data.updatedAt).getTime() > STALE_CLAIM_MS;
      if (data.status !== "pending_approval" && !staleApproved) {
        throw new HttpError(409, `This payout is ${data.status.replace("_", " ")} — it can't be sent again.`);
      }
      if (data.createdBy === caller.uid) throw new HttpError(403, "You can't approve a payout you prepared yourself.");
      tx.update(ref, { status: "approved", approvedBy: caller.uid, approvedAt: now, updatedAt: now, lastError: FieldValue.delete() });
      return data;
    });

    const revert = async (message: string) => {
      await ref.update({ status: "pending_approval", lastError: message, updatedAt: new Date().toISOString() });
    };

    try {
      // 2. Decide who is actually payable, from the database — not from what the browser sent.
      const lines: CreatorPayoutLine[] = run.creators.map((l) => ({ ...l }));
      const sendable: { line: CreatorPayoutLine; recipient: string; reference: string }[] = [];
      for (const line of lines) {
        if (line.status === "paid" || line.status === "processing") continue; // already sent (a retry)
        if (!(Number.isFinite(line.finalPayoutNGN) && line.finalPayoutNGN > 0)) {
          line.status = "skipped";
          continue;
        }
        // Integrity: a row's payout must equal its calculated earnings plus the accountant's
        // recorded adjustment — a hand-edited final amount is refused, not silently paid.
        if (Math.abs(line.finalPayoutNGN - (line.totalNetNGN + line.adjustmentNGN)) > 0.01) {
          await revert(`${line.displayName}'s payout doesn't equal earnings + adjustment.`);
          throw new HttpError(400, `${line.displayName}'s payout doesn't add up (earnings + adjustment). Ask the accountant to re-submit.`);
        }
        const bank = (await db.collection("users").doc(line.uid).collection("payoutDetails").doc("bank").get()).data();
        if (!bank || bank.verified !== true || !bank.recipientCode) {
          line.status = "skipped";
          line.failureReason = "No verified bank details";
          continue;
        }
        sendable.push({ line, recipient: bank.recipientCode as string, reference: transferReference(run.id, line.uid) });
      }

      const total = sendable.reduce((sum, s) => sum + s.line.finalPayoutNGN, 0);
      if (total > run.totalAmountNGN + 0.01) {
        await revert("Payable total exceeds the approved total — ask the accountant to re-submit.");
        throw new HttpError(400, "The payable total no longer matches this payout. Ask the accountant to re-submit it.");
      }
      if (sendable.length === 0) {
        await revert("Nobody in this run is payable.");
        throw new HttpError(400, "Nobody in this payout has verified bank details, so there's nothing to send.");
      }

      // 3. Balance check before spending anything.
      const bal = await paystack<{ currency: string; balance: number }[]>("/balance");
      const available = fromKobo(bal.data.find((b) => b.currency === "NGN")?.balance ?? 0);
      if (available < total) {
        await revert(`Insufficient Paystack balance: ${formatNGN(available)} available, ${formatNGN(total)} needed.`);
        throw new HttpError(400, `Insufficient Paystack balance — ${formatNGN(available)} available, ${formatNGN(total)} needed. Top up and try again.`);
      }

      // 4. Send in chunks.
      const label = periodLabel(run.period);
      for (let i = 0; i < sendable.length; i += BULK_LIMIT) {
        const chunk = sendable.slice(i, i + BULK_LIMIT);
        try {
          const res = await paystack<BulkItem[]>("/transfer/bulk", {
            method: "POST",
            body: JSON.stringify({
              currency: "NGN",
              source: "balance",
              transfers: chunk.map((c) => ({
                amount: toKobo(c.line.finalPayoutNGN),
                recipient: c.recipient,
                reference: c.reference,
                reason: `ÍléOtaku creator payout — ${label}`,
              })),
            }),
          });
          const items = Array.isArray(res.data) ? res.data : [];
          for (const c of chunk) {
            const item = items.find((it) => it.reference === c.reference) ?? items.find((it) => it.recipient === c.recipient);
            c.line.paystackReference = c.reference;
            if (item?.transfer_code) c.line.transferCode = item.transfer_code;
            // "success" = completed; anything else Paystack accepted (pending/otp/queued) is in flight
            // and the webhook finalises it.
            if (item?.status === "success") {
              c.line.status = "paid";
              c.line.paidAt = new Date().toISOString();
            } else if (item?.status === "failed") {
              c.line.status = "failed";
              c.line.failureReason = "Paystack rejected the transfer";
            } else {
              c.line.status = "processing";
              if (item?.status === "otp") c.line.failureReason = "Awaiting OTP confirmation in Paystack";
            }
          }
        } catch (error) {
          const message = error instanceof HttpError ? error.message : "Transfer request failed";
          for (const c of chunk) {
            c.line.status = "failed";
            c.line.paystackReference = c.reference;
            c.line.failureReason = message;
          }
        }
      }

      // 5. Persist: the run, a reference -> run lookup for the webhook, each creator's own
      //    `earnings` row (what their Payout tab reads), and a notification.
      const { status, failedCount } = deriveRunStatus(lines);
      const batch = db.batch();
      batch.update(ref, {
        creators: lines,
        status: status === "completed" || status === "failed" ? status : "processing",
        failedCount,
        paystackBatchId: `bulk_${run.id}_${Date.now()}`,
        updatedAt: new Date().toISOString(),
      });
      for (const c of sendable) {
        batch.set(db.collection("payoutTransfers").doc(c.reference), { payoutId: run.id, uid: c.line.uid, createdAt: now });
        batch.set(db.collection("earnings").doc(`${run.id}_${c.line.uid}`), {
          creatorId: c.line.uid,
          creatorName: c.line.displayName,
          amount: c.line.finalPayoutNGN,
          period: run.period,
          payoutStatus: c.line.status === "skipped" ? "failed" : c.line.status,
          payoutId: run.id,
          paystackReference: c.reference,
          ...(c.line.status === "paid" ? { paidAt: c.line.paidAt } : {}),
          ...(c.line.failureReason ? { failureReason: c.line.failureReason } : {}),
          createdAt: now,
        });
      }
      await batch.commit();

      await Promise.all(
        sendable
          .filter((c) => c.line.status !== "failed")
          .map((c) =>
            notifyUser(
              db,
              c.line.uid,
              "Your payout is on its way 💰",
              `${formatNGN(c.line.finalPayoutNGN)} for ${label} has been sent to your ${c.line.bankName ?? "bank"} account.`,
              "/creator"
            )
          )
      );

      return NextResponse.json({
        success: true,
        status,
        sent: sendable.filter((c) => c.line.status !== "failed").length,
        failed: failedCount,
        totalNGN: total,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("[payout transfer] unexpected failure:", error);
      await revert("Unexpected error while sending — check Paystack before retrying.").catch(() => {});
      throw new HttpError(500, "Something went wrong while sending. Check Paystack before retrying.");
    }
  });
}
