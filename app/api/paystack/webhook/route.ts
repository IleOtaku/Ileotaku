import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { deriveRunStatus, notifyUser } from "@/lib/server/payoutHelpers";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import type { PayoutRun } from "@/types";

export const dynamic = "force-dynamic";

/** Paystack webhook — the only thing that ever moves a payout from "Processing" to "Paid" or "Failed"
 * after the transfer request itself. Register `https://<your-domain>/api/paystack/webhook` under
 * Paystack Dashboard -> Settings -> API Keys & Webhooks. The request is authenticated by an HMAC
 * SHA-512 of the raw body signed with the secret key (x-paystack-signature); anything else is
 * rejected before it touches Firestore. */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false }, { status: 401 });

  let event: { event?: string; data?: { reference?: string; reason?: string; status?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const kind = event.event;
  const reference = event.data?.reference;
  if (!reference || !kind || !["transfer.success", "transfer.failed", "transfer.reversed"].includes(kind)) {
    return NextResponse.json({ ok: true, ignored: true }); // not ours — always 200 so Paystack stops retrying
  }

  const db = adminDb();
  const link = (await db.collection("payoutTransfers").doc(reference).get()).data() as { payoutId: string; uid: string } | undefined;
  if (!link) return NextResponse.json({ ok: true, ignored: true });

  const paid = kind === "transfer.success";
  const reason = paid ? undefined : event.data?.reason || (kind === "transfer.reversed" ? "Transfer was reversed" : "Transfer failed");
  const runRef = db.collection("payouts").doc(link.payoutId);

  const notify = await db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists) return null;
    const run = { id: snap.id, ...snap.data() } as PayoutRun;
    const line = run.creators.find((l) => l.uid === link.uid);
    if (!line || line.status === "paid" || line.status === (paid ? "paid" : "failed")) return null; // already applied
    const at = new Date().toISOString();

    line.status = paid ? "paid" : "failed";
    if (paid) line.paidAt = at;
    if (reason) line.failureReason = reason;
    else delete line.failureReason;

    const { status, failedCount } = deriveRunStatus(run.creators);
    tx.update(runRef, { creators: run.creators, status, failedCount, updatedAt: at });
    tx.set(
      db.collection("earnings").doc(`${run.id}_${link.uid}`),
      { payoutStatus: line.status, ...(paid ? { paidAt: at } : {}), ...(reason ? { failureReason: reason } : {}) },
      { merge: true }
    );
    return { amount: line.finalPayoutNGN, period: run.period, bankName: line.bankName };
  });

  if (notify) {
    await notifyUser(
      db,
      link.uid,
      paid ? "Payout received ✅" : "Payout couldn't be completed",
      paid
        ? `${formatNGN(notify.amount)} for ${periodLabel(notify.period)} has landed in your ${notify.bankName ?? "bank"} account.`
        : `Your ${formatNGN(notify.amount)} payout for ${periodLabel(notify.period)} failed (${reason}). We'll be in touch to sort it out.`,
      "/creator"
    );
  }

  return NextResponse.json({ ok: true });
}
