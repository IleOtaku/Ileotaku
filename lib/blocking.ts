import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import type { BlockedUser } from "@/types";

const USERS = "users";
const BLOCKED = "blocked";

function blockedDocRef(uid: string, targetUid: string) {
  return doc(db, USERS, uid, BLOCKED, targetUid);
}

/** Blocks `targetUid` for `uid`: writes the block record and, since a block is meant to sever
 * the relationship entirely, also removes any existing follow edge in either direction (a
 * blocked account shouldn't linger in either person's followers/following list — the Followers
 * list requirement in the spec falls out of this automatically, since every UI that reads
 * followers/following already reads it off the profile doc this updates).
 *
 * The block record (`users/{uid}/blocked/{targetUid}`) is the one write that actually matters
 * for privacy/safety — every gating check in this codebase reads only that. The two
 * followers/following cleanup writes are a nice-to-have side effect, not a correctness
 * requirement, so each is best-effort and swallowed independently: found live during testing
 * that a target whose own `users/{targetUid}` doc doesn't exist (or any other transient write
 * failure on either side) was aborting the ENTIRE block via `Promise.all`'s fail-fast behavior —
 * meaning the block record itself never got written and the user silently stayed unblocked. */
export async function blockUser(uid: string, targetUid: string): Promise<void> {
  if (uid === targetUid) return;
  try {
    await setDoc(blockedDocRef(uid, targetUid), { targetUid, blockedAt: serverTimestamp() });
  } catch (error) {
    await logError(error, { operation: "blocking.blockUser", uid, targetUid });
    throw error;
  }

  await Promise.all([
    updateDoc(doc(db, USERS, uid), {
      following: arrayRemove(targetUid),
      followers: arrayRemove(targetUid),
    }).catch((error) => logError(error, { operation: "blocking.blockUser.cleanupSelf", uid, targetUid })),
    updateDoc(doc(db, USERS, targetUid), {
      following: arrayRemove(uid),
      followers: arrayRemove(uid),
    }).catch((error) => logError(error, { operation: "blocking.blockUser.cleanupTarget", uid, targetUid })),
  ]);
}

export async function unblockUser(uid: string, targetUid: string): Promise<void> {
  try {
    await deleteDoc(blockedDocRef(uid, targetUid));
  } catch (error) {
    await logError(error, { operation: "blocking.unblockUser", uid, targetUid });
    throw error;
  }
}

export async function isBlocked(uid: string, targetUid: string): Promise<boolean> {
  try {
    const snap = await getDoc(blockedDocRef(uid, targetUid));
    return snap.exists();
  } catch (error) {
    await logError(error, { operation: "blocking.isBlocked", uid, targetUid });
    return false;
  }
}

/** The inverse check: has `targetUid` blocked `uid`? Same underlying doc, just read from the
 * other side — `users/{targetUid}/blocked/{uid}`. */
export async function isBlockedBy(uid: string, targetUid: string): Promise<boolean> {
  return isBlocked(targetUid, uid);
}

/** Either direction at once — the check nearly every call site actually wants ("is there any
 * block between these two people"), since the UI generally treats "I blocked them" and "they
 * blocked me" identically (content hidden, can't DM, etc.) even though the two are stored and
 * manageable separately (only the blocker can unblock). */
export async function isBlockedEitherWay(uid: string, targetUid: string): Promise<boolean> {
  const [a, b] = await Promise.all([isBlocked(uid, targetUid), isBlockedBy(uid, targetUid)]);
  return a || b;
}

export async function getBlockedUsers(uid: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, USERS, uid, BLOCKED));
    return snap.docs.map((d) => (d.data() as BlockedUser).targetUid ?? d.id);
  } catch (error) {
    await logError(error, { operation: "blocking.getBlockedUsers", uid });
    return [];
  }
}
