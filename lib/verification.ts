import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { updateUserPrefs } from "./firestore";
import { createNotification } from "./notifications";
import {
  NotificationType,
  type VerificationApplication,
  type VerificationCategory,
} from "@/types";

const APPLICATIONS = "verificationApplications";

/* ---------------------------- Badge hierarchy ---------------------------- */

export type VerificationTier = "founder" | "admin" | "publisher" | "creator" | "verified";

export interface VerificationBadgeInfo {
  color: string;
  label: string;
  tier: VerificationTier;
}

/** 5-tier verification badge overhaul. Priority order — a user shows at most ONE badge, the
 * highest tier they qualify for:
 *   1. Founder (gold #d4a843)   — isFounder:true. Set manually, never through the apply flow.
 *   2. Admin   (platinum #9ecfef) — isAdmin:true (and not already caught by Founder above).
 *   3. Publisher (purple #a855f7) — isVerified:true && verifiedType:"publisher".
 *   4. Creator (blue #3b82f6)     — isVerified:true && verifiedType:"creator".
 *   5. General (white #ffffff)    — isVerified:true with no verifiedType.
 * Founder and Admin are independent of `isVerified` — they show even if that flag is false,
 * matching how those two are granted (manually / via the admin role, not the apply-and-review
 * flow the other three go through).
 *
 * `isPublisher` is accepted as a legacy fallback for comments/posts denormalized before
 * `verifiedType` existed (see SeriesComment/FeedComment/CreatorPost's own doc comments) — treated
 * as `verifiedType: "publisher"` only when `verifiedType` itself is absent, so old documents
 * don't need a backfill migration to keep showing the right color.
 */
export function getVerificationBadge(user: {
  isFounder?: boolean;
  isAdmin?: boolean;
  verifiedType?: string | null;
  isVerified?: boolean;
  /** Legacy fallback only — see doc comment above. */
  isPublisher?: boolean;
}): VerificationBadgeInfo | null {
  if (user.isFounder) return { color: "#d4a843", label: "Founder", tier: "founder" };
  if (user.isAdmin) return { color: "#9ecfef", label: "Admin", tier: "admin" };

  const effectiveType = user.verifiedType ?? (user.isPublisher ? "publisher" : undefined);
  if (user.isVerified && effectiveType === "publisher") {
    return { color: "#a855f7", label: "Verified Publisher", tier: "publisher" };
  }
  if (user.isVerified && effectiveType === "creator") {
    return { color: "#3b82f6", label: "Verified Creator", tier: "creator" };
  }
  if (user.isVerified) return { color: "#ffffff", label: "Verified Member", tier: "verified" };
  return null;
}

/* ---------------------------- Applications ---------------------------- */

function applicationRef(uid: string) {
  return doc(db, APPLICATIONS, uid);
}

export interface SubmitVerificationInput {
  displayName: string;
  handle?: string;
  photoURL?: string;
  reason: string;
  links: string[];
  category: VerificationCategory;
}

/** Only ever called after the caller has confirmed `isPlatinum` client-side — also enforced
 * server-side by firestore.rules' own check on the signed-in user's profile, so a crafted client
 * call can't bypass the Platinum requirement either. Overwrites any previous application (e.g. a
 * reapply after rejection) with a fresh "pending" one, same uid-keyed document. */
export async function submitVerificationApplication(
  uid: string,
  data: SubmitVerificationInput
): Promise<void> {
  try {
    const application: VerificationApplication = {
      uid,
      displayName: data.displayName,
      ...(data.handle ? { handle: data.handle } : {}),
      ...(data.photoURL ? { photoURL: data.photoURL } : {}),
      reason: data.reason.trim(),
      links: data.links.filter((l) => l.trim().length > 0).slice(0, 3),
      category: data.category,
      status: "pending",
      submittedAt: new Date().toISOString(),
      isPlatinum: true,
    };
    await setDoc(applicationRef(uid), application);
  } catch (error) {
    await logError(error, { operation: "verification.submitVerificationApplication", uid });
    throw error;
  }
}

export async function getVerificationApplication(uid: string): Promise<VerificationApplication | null> {
  const snap = await getDoc(applicationRef(uid));
  return snap.exists() ? (snap.data() as VerificationApplication) : null;
}

/** Admin-only (enforced by firestore.rules) — every application, newest submission first, for
 * the Verification Applications tab's Pending/Approved/Rejected filter to slice locally. */
export async function getAllApplications(): Promise<VerificationApplication[]> {
  const snap = await getDocs(query(collection(db, APPLICATIONS), orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => d.data() as VerificationApplication);
}

/** Approves `uid`'s application, setting the actual badge fields on their profile — `verifiedType`
 * left undefined (→ null) gives the white "General" badge, matching the admin dashboard's
 * "Approve (General)" action. Notifies the applicant either way. */
export async function approveApplication(
  uid: string,
  adminUid: string,
  verifiedType?: "creator" | "publisher"
): Promise<void> {
  try {
    await updateUserPrefs(uid, { isVerified: true, verifiedType: verifiedType ?? null });
    await updateDoc(applicationRef(uid), {
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminUid,
    });
    await createNotification(
      uid,
      NotificationType.BADGE_APPROVED,
      "You're verified!",
      "🎉 Congratulations! Your verification application was approved. You're now a verified member of ÍléOtaku!",
      "/profile"
    );
  } catch (error) {
    await logError(error, { operation: "verification.approveApplication", uid, adminUid });
    throw error;
  }
}

export async function rejectApplication(uid: string, adminUid: string, reason: string): Promise<void> {
  try {
    await updateDoc(applicationRef(uid), {
      status: "rejected",
      rejectionReason: reason.trim(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminUid,
    });
    await createNotification(
      uid,
      NotificationType.MODERATION_ACTION,
      "Verification application reviewed",
      `Your verification application was reviewed — ${reason.trim()}. You can reapply after 30 days.`,
      "/profile"
    );
  } catch (error) {
    await logError(error, { operation: "verification.rejectApplication", uid, adminUid });
    throw error;
  }
}
