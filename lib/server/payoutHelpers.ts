/** Server-only helpers shared by the payout transfer route and the Paystack webhook. */
import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { NotificationType, type CreatorPayoutLine, type PayoutRunStatus } from "@/types";

/** Deterministic per (payout, creator): re-sending the same payout can never create a second
 * transfer, because Paystack rejects a reference it has already seen. Paystack requires 16-50
 * lowercase alphanumeric/underscore/dash characters. */
export function transferReference(payoutId: string, uid: string): string {
  return "pyt_" + createHash("sha1").update(`${payoutId}:${uid}`).digest("hex").slice(0, 32);
}

export async function notifyUser(db: Firestore, uid: string, title: string, body: string, actionURL: string): Promise<void> {
  try {
    await db.collection("users").doc(uid).collection("notifications").add({
      // No dedicated payout type exists; EARNINGS_MILESTONE renders with the wallet icon and is
      // never suppressed by a notification preference.
      type: NotificationType.EARNINGS_MILESTONE,
      title,
      body,
      actionURL,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // A missed notification must never fail a payout.
  }
}

/** Overall run status derived from its lines. `failedCount` is reported separately so a run where
 * most creators were paid but one bounced reads as "completed" with a warning, not "failed". */
export function deriveRunStatus(lines: CreatorPayoutLine[]): { status: PayoutRunStatus; failedCount: number } {
  const relevant = lines.filter((l) => l.status !== "skipped");
  const failedCount = relevant.filter((l) => l.status === "failed").length;
  if (relevant.some((l) => l.status === "processing" || l.status === "pending")) return { status: "processing", failedCount };
  if (relevant.length > 0 && failedCount === relevant.length) return { status: "failed", failedCount };
  return { status: "completed", failedCount };
}
