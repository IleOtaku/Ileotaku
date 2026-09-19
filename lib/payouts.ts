/**
 * Client-side data layer for creator payouts: the `payouts/{period}` runs an accountant prepares,
 * the Super Admin reviews, and the API routes send (see app/api/paystack/transfer). Money never
 * moves from here — this only reads and writes the run documents and calls the server routes.
 *
 * One run per calendar month (doc id === "YYYY-MM"), which makes it structurally impossible to
 * prepare two competing payouts for the same month and pay creators twice.
 */
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { getAllAdmins } from "./admin";
import { formatNGN, periodLabel } from "./earningsConfig";
import { createNotification } from "./notifications";
import { NotificationType, type CreatorPayoutLine, type PayoutDetails, type PayoutRun } from "@/types";

const PAYOUTS = "payouts";

/** The earnings row the server sends the accountant UI (see lib/earnings.ts CreatorEarnings) — only
 * the fields the client needs, so this file never imports the server-only module. */
export interface EarningsRow {
  uid: string;
  displayName: string;
  handle?: string;
  photoURL?: string;
  coinUnlocksNGN: number;
  tipsNGN: number;
  adRevenueNGN: number;
  platinumShareNGN: number;
  totalNetNGN: number;
  grossNGN: number;
  hasBankDetails: boolean;
  bankName?: string;
  accountLast4?: string;
  accountName?: string;
}

export function toPayoutLine(row: EarningsRow, adjustmentNGN = 0, adjustmentReason?: string): CreatorPayoutLine {
  const finalPayoutNGN = Math.round((row.totalNetNGN + adjustmentNGN) * 100) / 100;
  return {
    uid: row.uid,
    displayName: row.displayName,
    ...(row.handle ? { handle: row.handle } : {}),
    ...(row.photoURL ? { photoURL: row.photoURL } : {}),
    coinUnlocksNGN: row.coinUnlocksNGN,
    adRevenueNGN: row.adRevenueNGN,
    platinumShareNGN: row.platinumShareNGN,
    tipsNGN: row.tipsNGN,
    totalNetNGN: row.totalNetNGN,
    adjustmentNGN,
    ...(adjustmentReason ? { adjustmentReason } : {}),
    finalPayoutNGN,
    grossNGN: row.grossNGN,
    hasBankDetails: row.hasBankDetails,
    ...(row.bankName ? { bankName: row.bankName } : {}),
    ...(row.accountLast4 ? { accountLast4: row.accountLast4 } : {}),
    ...(row.accountName ? { accountName: row.accountName } : {}),
    status: "pending",
  };
}

/** A creator can be paid only with verified bank details and a positive amount. */
export function isPayable(line: CreatorPayoutLine): boolean {
  return line.hasBankDetails && line.finalPayoutNGN > 0;
}

export function summarizeLines(lines: CreatorPayoutLine[]) {
  const payable = lines.filter(isPayable);
  return {
    totalCreators: payable.length,
    totalAmountNGN: Math.round(payable.reduce((s, l) => s + l.finalPayoutNGN, 0) * 100) / 100,
    // The platform's cut on the revenue behind what's being paid: gross minus what creators net.
    platformFeeNGN: Math.round(payable.reduce((s, l) => s + Math.max(0, l.grossNGN - l.totalNetNGN), 0) * 100) / 100,
  };
}

/** Authenticated call to one of our own API routes. */
export async function callApi<T = Record<string, unknown>>(
  user: User,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> {
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${idToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; message?: string };
  if (!res.ok || data.success === false) throw new Error(data.message ?? "Request failed. Please try again.");
  return data;
}

/* ---------------------------- Payout runs ---------------------------- */

export async function getPayoutRun(period: string): Promise<PayoutRun | null> {
  const snap = await getDoc(doc(db, PAYOUTS, period));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PayoutRun) : null;
}

export async function getPayoutRuns(): Promise<PayoutRun[]> {
  const snap = await getDocs(query(collection(db, PAYOUTS), orderBy("period", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PayoutRun);
}

export function subscribeToPayoutRuns(callback: (runs: PayoutRun[]) => void, onError?: () => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, PAYOUTS), orderBy("period", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PayoutRun)),
    () => {
      onError?.();
      callback([]);
    }
  );
}

/** Statuses in which the accountant may still change a run. */
export const EDITABLE_STATUSES: PayoutRun["status"][] = ["draft", "changes_requested"];

export interface SaveRunInput {
  period: string;
  periodStart: string;
  periodEnd: string;
  lines: CreatorPayoutLine[];
  accountantNotes?: string;
  accountant: { uid: string; displayName?: string };
}

/** Saves the run as a draft (or back to draft after changes were requested). Refuses to touch a run
 * that's already been submitted, approved or sent. */
export async function saveDraft(input: SaveRunInput): Promise<void> {
  const existing = await getPayoutRun(input.period);
  if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`The ${periodLabel(input.period)} payout is already ${existing.status.replace("_", " ")} and can't be edited.`);
  }
  const now = new Date().toISOString();
  await setDoc(doc(db, PAYOUTS, input.period), {
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdBy: existing?.createdBy ?? input.accountant.uid,
    ...(input.accountant.displayName ? { createdByName: existing?.createdByName ?? input.accountant.displayName } : {}),
    status: "draft",
    ...summarizeLines(input.lines),
    creators: input.lines,
    accountantNotes: input.accountantNotes ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

/** Submits the run to the Super Admin(s): writes it as pending_approval, then notifies each of them. */
export async function submitForApproval(input: SaveRunInput): Promise<void> {
  const summary = summarizeLines(input.lines);
  if (summary.totalCreators === 0) throw new Error("Nobody in this run can be paid yet — check bank details and amounts.");
  const existing = await getPayoutRun(input.period);
  if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`The ${periodLabel(input.period)} payout is already ${existing.status.replace("_", " ")} and can't be edited.`);
  }
  const now = new Date().toISOString();
  await setDoc(doc(db, PAYOUTS, input.period), {
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdBy: existing?.createdBy ?? input.accountant.uid,
    ...(input.accountant.displayName ? { createdByName: existing?.createdByName ?? input.accountant.displayName } : {}),
    status: "pending_approval",
    ...summary,
    creators: input.lines,
    accountantNotes: input.accountantNotes ?? "",
    submittedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  // Best-effort — the run is already submitted; a failed notification shouldn't undo that (the
  // Super Admin's Overview tab shows pending runs regardless).
  try {
    const admins = await getAllAdmins();
    const supers = admins.filter((a) => a.isAdmin && (!a.adminType || a.adminType === "super"));
    await Promise.all(
      supers.map((a) =>
        createNotification(
          a.uid,
          NotificationType.EARNINGS_MILESTONE,
          "💰 Payout approval required",
          `${input.accountant.displayName ?? "The accountant"} submitted the ${periodLabel(input.period)} payout — ${summary.totalCreators} creators, ${formatNGN(summary.totalAmountNGN)}.`,
          "/admin"
        ).catch(() => {})
      )
    );
  } catch {
    // see above
  }
}

/** Super Admin sends a run back to the accountant with a note. */
export async function requestChanges(period: string, note: string, superAdminUid: string): Promise<void> {
  const run = await getPayoutRun(period);
  if (!run) throw new Error("Payout not found.");
  await updateDoc(doc(db, PAYOUTS, period), {
    status: "changes_requested",
    reviewNotes: note.trim(),
    updatedAt: new Date().toISOString(),
  });
  try {
    await createNotification(
      run.createdBy,
      NotificationType.EARNINGS_MILESTONE,
      "Payout needs changes",
      `${periodLabel(period)}: ${note.trim() || "The Super Admin asked for changes."}`,
      "/admin"
    );
  } catch {
    // best-effort
  }
  void superAdminUid;
}

/** Sends an approved run: the server route does the real work (auth, balance, Paystack). */
export async function approveAndSend(user: User, period: string) {
  return callApi<{ sent: number; failed: number; totalNGN: number; status: string }>(user, "/api/paystack/transfer", {
    method: "POST",
    body: { payoutId: period },
  });
}

/* ---------------------------- Bank details (creator side) ---------------------------- */

export async function getMyPayoutDetails(uid: string): Promise<PayoutDetails | null> {
  const snap = await getDoc(doc(db, "users", uid, "payoutDetails", "bank"));
  return snap.exists() ? (snap.data() as PayoutDetails) : null;
}
