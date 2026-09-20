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
const TIER_INFO: Record<VerificationTier, { color: string; label: string }> = {
  founder: { color: "#d4a843", label: "Founder" },
  admin: { color: "#9ecfef", label: "Admin" },
  publisher: { color: "#a855f7", label: "Verified Publisher" },
  creator: { color: "#3b82f6", label: "Verified Creator" },
  verified: { color: "#ffffff", label: "Verified Member" },
};

/** The tier→color/label half of getVerificationBadge, factored out so a surface that only has a
 * bare tier string (not the full isFounder/isAdmin/isVerified/verifiedType shape) can still
 * render the right badge — see tierToBadgeUser's doc comment for why that's needed at all. */
function getBadgeForTier(tier: VerificationTier | null | undefined): VerificationBadgeInfo | null {
  if (!tier) return null;
  const info = TIER_INFO[tier];
  return info ? { ...info, tier } : null;
}

/** True when a paid "white" verification has lapsed: verified with no creator/publisher type, not
 * Platinum, and a `verificationExpiresAt` in the past. Accounts with no expiry stored (Platinum,
 * Creator, Publisher, or verified before expiry existed) are permanent and never expire. */
export function isWhiteVerificationExpired(user: {
  verifiedType?: string | null;
  isPlatinum?: boolean;
  isPublisher?: boolean;
  isFounder?: boolean;
  isAdmin?: boolean;
  verificationExpiresAt?: string | null;
}): boolean {
  if (!user.verificationExpiresAt) return false;
  if (user.isFounder || user.isAdmin) return false;
  // Beta feedback: creator ₦1,500 / publisher ₦2,000 per month — a Creator or Publisher badge that carries an
  // expiry lapses like the white one does. (One granted before monthly billing has no expiry, so it's untouched.)
  const typed = user.verifiedType === "creator" || user.verifiedType === "publisher";
  if (!typed && (user.isPlatinum || user.isPublisher)) return false;
  const expires = new Date(user.verificationExpiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
}

/** Runs on every load of the signed-in user's own profile (see hooks/useAuth.ts): if their white
 * verification has lapsed, flips isVerified off. Only ever writes their OWN document, which is
 * all firestore.rules allows a client to do — other people's lapsed badges are hidden at render
 * time by getVerificationBadge below instead. Returns true if it changed anything. */
export async function enforceVerificationExpiry(
  uid: string,
  profile: Parameters<typeof isWhiteVerificationExpired>[0] & { isVerified?: boolean }
): Promise<boolean> {
  if (!profile.isVerified || !isWhiteVerificationExpired(profile)) return false;
  try {
    await updateDoc(doc(db, "users", uid), { isVerified: false });
    return true;
  } catch (error) {
    await logError(error, { operation: "verification.enforceVerificationExpiry", uid });
    return false;
  }
}

/* ---------------------------- Creator/Publisher requirements ---------------------------- */

/** Beta feedback: "make the verification requirements simple but difficult." Four plain, checkable rules —
 * easy to understand, hard to fake, and only met by someone who has actually been building an audience.
 * The numbers live here so they can be tuned in one place. */
export const VERIFICATION_REQUIREMENTS = {
  minAccountDays: 30,
  minFollowers: 500,
  minPosts: 25,
  /** Posted in at least `minActiveWeeks` of the last `weeks` weeks. */
  weeks: 4,
  minActiveWeeks: 3,
} as const;

export interface RequirementCheck {
  id: "age" | "followers" | "posts" | "consistency";
  label: string;
  current: number;
  target: number;
  met: boolean;
}

/** Evaluates the four requirements for an account, given the ISO dates of everything it has posted. */
export function evaluateVerificationRequirements(
  profile: { createdAt?: string; followers?: string[] },
  postDates: string[],
  now = Date.now()
): RequirementCheck[] {
  const R = VERIFICATION_REQUIREMENTS;
  const ageDays = profile.createdAt ? Math.floor((now - new Date(profile.createdAt).getTime()) / 86_400_000) : 0;
  const followers = profile.followers?.length ?? 0;
  const activeWeeks = new Set(
    postDates
      .map((d) => Math.floor((now - new Date(d).getTime()) / (7 * 86_400_000)))
      .filter((w) => w >= 0 && w < R.weeks)
  ).size;
  return [
    { id: "age", label: `Account is at least ${R.minAccountDays} days old`, current: Math.max(0, ageDays), target: R.minAccountDays, met: ageDays >= R.minAccountDays },
    { id: "followers", label: `${R.minFollowers} followers`, current: followers, target: R.minFollowers, met: followers >= R.minFollowers },
    { id: "posts", label: `${R.minPosts} posts`, current: postDates.length, target: R.minPosts, met: postDates.length >= R.minPosts },
    {
      id: "consistency",
      label: `Posted in ${R.minActiveWeeks} of the last ${R.weeks} weeks`,
      current: activeWeeks,
      target: R.minActiveWeeks,
      met: activeWeeks >= R.minActiveWeeks,
    },
  ];
}

/** Hourly Platinum (lib/payments.ts) is the one Platinum that ends on its own: when its window has
 * run out, the owner's own load flips isPlatinum back off. Monthly/annual plans, admins and
 * founders are deliberately left alone. Returns true if it changed anything. */
export async function enforcePlatinumExpiry(
  uid: string,
  profile: { isPlatinum?: boolean; platinumTier?: string; platinumUntil?: string; isAdmin?: boolean; isFounder?: boolean }
): Promise<boolean> {
  if (!profile.isPlatinum || profile.platinumTier !== "hourly" || profile.isAdmin || profile.isFounder) return false;
  const until = profile.platinumUntil ? new Date(profile.platinumUntil).getTime() : NaN;
  if (!Number.isFinite(until) || until > Date.now()) return false;
  try {
    await updateDoc(doc(db, "users", uid), { isPlatinum: false });
    return true;
  } catch (error) {
    await logError(error, { operation: "verification.enforcePlatinumExpiry", uid });
    return false;
  }
}

export function getVerificationBadge(user: {
  isFounder?: boolean;
  isAdmin?: boolean;
  verifiedType?: string | null;
  isVerified?: boolean;
  /** Legacy fallback only — see doc comment above. */
  isPublisher?: boolean;
  isPlatinum?: boolean;
  verificationExpiresAt?: string | null;
}): VerificationBadgeInfo | null {
  if (user.isFounder) return getBadgeForTier("founder");
  if (user.isAdmin) return getBadgeForTier("admin");
  if (isWhiteVerificationExpired(user)) return null;

  const effectiveType = user.verifiedType ?? (user.isPublisher ? "publisher" : undefined);
  if (user.isVerified && effectiveType === "publisher") return getBadgeForTier("publisher");
  if (user.isVerified && effectiveType === "creator") return getBadgeForTier("creator");
  if (user.isVerified) return getBadgeForTier("verified");
  return null;
}

/** Collapses a user's raw badge fields down to the single tier string denormalized onto
 * publishedSeries as `authorVerifiedType` (beta feedback: manga search results were showing a
 * white "General" badge for every creator regardless of their real tier, because the only thing
 * ever denormalized was a bare `authorVerified` boolean). */
export function computeVerifiedType(user: {
  isFounder?: boolean;
  isAdmin?: boolean;
  verifiedType?: string | null;
  isVerified?: boolean;
  isPublisher?: boolean;
}): VerificationTier | null {
  return getVerificationBadge(user)?.tier ?? null;
}

/**
 * The inverse of computeVerifiedType — reconstructs a VerificationBadge-compatible object from
 * just a denormalized tier string. A surface holding only publishedSeries' `authorVerifiedType`
 * snapshot (not the creator's live isFounder/isAdmin/isVerified/verifiedType fields) still needs
 * to render through the one shared <VerificationBadge> component rather than growing a second,
 * parallel badge-rendering path — this bridges that gap.
 */
export function tierToBadgeUser(
  tier: VerificationTier | null | undefined
): { isFounder?: boolean; isAdmin?: boolean; isVerified?: boolean; verifiedType?: string | null } | null {
  switch (tier) {
    case "founder":
      return { isFounder: true };
    case "admin":
      return { isAdmin: true };
    case "publisher":
      return { isVerified: true, verifiedType: "publisher" };
    case "creator":
      return { isVerified: true, verifiedType: "creator" };
    case "verified":
      return { isVerified: true, verifiedType: null };
    default:
      return null;
  }
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
    // A "white" (no creator/publisher type) approval for an account that isn't Platinum is paid,
    // recurring verification — it starts with 30 days, then needs a coin renewal. Platinum,
    // Creator and Publisher verification stays permanent (no expiry stored).
    // Creator and Publisher verification is now a monthly paid status too (₦1,500 / ₦2,000 — see
    // VERIFICATION_PRICES in lib/payments.ts): approval starts a 30-day window, then it needs renewing.
    const applicantIsPlatinum = (await getDoc(doc(db, "users", uid))).data()?.isPlatinum === true;
    const expiresAt =
      verifiedType || !applicantIsPlatinum ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    await updateUserPrefs(uid, {
      isVerified: true,
      verifiedType: verifiedType ?? null,
      verificationExpiresAt: expiresAt,
    });
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
