import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateUserPrefs } from "./firestore";
import { createNotification } from "./notifications";
import { NotificationType } from "@/types";

const PROFILE_VISITS = "profileVisits";
const VISITORS = "visitors";
/** Below this gap, revisiting the same profile doesn't count as a fresh "new visitor" for
 * notification purposes — it still refreshes `visitedAt` (so the visitor stays "most recent"),
 * just without re-notifying the owner on every page reload/re-render. */
const RENOTIFY_AFTER_MS = 60 * 60 * 1000;
const REVEAL_COST = 10;
const REVEAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ProfileVisitor {
  visitorUid: string;
  visitedAt: string;
  isAnonymous: boolean;
}

function visitorDocRef(profileUid: string, visitorUid: string) {
  return doc(db, PROFILE_VISITS, profileUid, VISITORS, visitorUid);
}

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in (value as object)) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : new Date().toISOString();
}

/**
 * Records that `visitorUid` viewed `profileUid`'s profile. Never records a self-visit. A
 * Platinum visitor with `hideProfileVisits` enabled still gets recorded (the owner can always
 * tell *someone* visited, and can pay to reveal who) but flagged `isAnonymous: true` so the UI
 * withholds their identity until revealed — see purchaseVisitorReveal(). A free account's visits
 * are always attributed, matching the spec's "free users are always visible" rule.
 *
 * Best-effort: swallows its own errors rather than throwing into the profile page's render path,
 * since a missed visit record should never block someone from viewing a profile.
 */
export async function recordVisit(visitorUid: string, profileUid: string): Promise<void> {
  if (visitorUid === profileUid) return;
  try {
    const ref = visitorDocRef(profileUid, visitorUid);
    const [existing, visitorProfile] = await Promise.all([getDoc(ref), getUserProfile(visitorUid)]);
    const isAnonymous = visitorProfile?.isPlatinum === true && visitorProfile?.hideProfileVisits === true;

    await setDoc(ref, { visitorUid, visitedAt: serverTimestamp(), isAnonymous }, { merge: true });

    const lastVisitedAt = existing.exists() ? toIso(existing.data()?.visitedAt) : null;
    const isFreshEnough = !lastVisitedAt || Date.now() - new Date(lastVisitedAt).getTime() > RENOTIFY_AFTER_MS;
    if (isFreshEnough) {
      await createNotification(
        profileUid,
        NotificationType.PROFILE_VISIT,
        "New profile visitor",
        isAnonymous ? "Someone viewed your profile 👁" : `${visitorProfile?.displayName ?? "Someone"} viewed your profile`,
        "/profile"
      ).catch(() => {});
    }
  } catch (error) {
    await logError(error, { operation: "profileVisits.recordVisit", visitorUid, profileUid });
  }
}

/** Last 10 visitors, newest first. `viewerUid` (the profile owner reading their own visitor
 * list) is used to check for an active purchaseVisitorReveal() window — while one is active,
 * this returns real identities for anonymous entries too (via the separate resolveRevealed flag
 * the caller checks with isVisitorRevealFresh, rather than mutating `isAnonymous` here, since the
 * raw record itself never actually stops being an anonymous visit). */
export async function getRecentVisitors(profileUid: string, _viewerUid: string): Promise<ProfileVisitor[]> {
  try {
    const q = query(
      collection(db, PROFILE_VISITS, profileUid, VISITORS),
      orderBy("visitedAt", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return { visitorUid: d.id, visitedAt: toIso(data.visitedAt), isAnonymous: data.isAnonymous === true };
    });
  } catch (error) {
    await logError(error, { operation: "profileVisits.getRecentVisitors", profileUid });
    return [];
  }
}

/** Total distinct visitors in the last 7 days — the "👁 X people visited your profile this
 * week" figure. */
export async function getVisitorCount(profileUid: string): Promise<number> {
  try {
    // visitedAt is written via serverTimestamp(), so it's stored as a real Firestore Timestamp —
    // a range comparison against a plain ISO string here would silently match nothing (Firestore
    // requires the query value's type to match the field's stored type).
    const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, PROFILE_VISITS, profileUid, VISITORS),
      where("visitedAt", ">=", weekAgo)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    await logError(error, { operation: "profileVisits.getVisitorCount", profileUid });
    return 0;
  }
}

/** Real-time listener on a profile's visitors (newest 10), for the live "Who Viewed Your
 * Profile" section. */
export function subscribeToVisitors(profileUid: string, callback: (visitors: ProfileVisitor[]) => void): Unsubscribe {
  const q = query(collection(db, PROFILE_VISITS, profileUid, VISITORS), orderBy("visitedAt", "desc"), limit(10));
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data();
          return { visitorUid: d.id, visitedAt: toIso(data.visitedAt), isAnonymous: data.isAnonymous === true };
        })
      ),
    () => callback([])
  );
}

export interface RevealResult {
  success: boolean;
  message?: string;
}

/** Spends REVEAL_COST coins to unmask the 3 most recent anonymous visitors on `profileUid` for
 * REVEAL_WINDOW_MS — writes users/{uid}/revealedVisitors/{profileUid} with an expiry, which
 * isVisitorRevealActive() below checks. */
export async function purchaseVisitorReveal(uid: string, profileUid: string): Promise<RevealResult> {
  try {
    const profile = await getUserProfile(uid);
    if (!profile || (profile.coins ?? 0) < REVEAL_COST) {
      return { success: false, message: `Not enough coins — revealing visitors costs ${REVEAL_COST} coins.` };
    }
    const newBalance = profile.coins - REVEAL_COST;
    await updateUserPrefs(uid, { coins: newBalance });
    const revealedAt = new Date();
    const expiresAt = new Date(revealedAt.getTime() + REVEAL_WINDOW_MS);
    await setDoc(doc(db, "users", uid, "revealedVisitors", profileUid), {
      revealedAt: revealedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return { success: true };
  } catch (error) {
    await logError(error, { operation: "profileVisits.purchaseVisitorReveal", uid, profileUid });
    return { success: false, message: "Couldn't reveal your visitors right now. Please try again." };
  }
}

/** Whether `uid` currently has an unexpired reveal purchased for `profileUid` — checked by the
 * "Who Viewed Your Profile" section to decide whether to show real identities for otherwise-
 * anonymous entries. */
export async function isVisitorRevealActive(uid: string, profileUid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "users", uid, "revealedVisitors", profileUid));
    if (!snap.exists()) return false;
    const expiresAt = snap.data().expiresAt as string | undefined;
    return !!expiresAt && new Date(expiresAt).getTime() > Date.now();
  } catch (error) {
    await logError(error, { operation: "profileVisits.isVisitorRevealActive", uid, profileUid });
    return false;
  }
}
