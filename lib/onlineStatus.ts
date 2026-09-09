import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";

const ONLINE_STATUS = "onlineStatus";

/** A presence doc counts as stale (and should be shown as offline regardless of its own
 * isOnline flag) once its lastSeen is older than this — the safety net for setOffline never
 * having fired at all, which is the normal case for an abrupt tab close/crash: Firestore has no
 * server-side disconnect detection the way Realtime Database's onDisconnect does, and a
 * `beforeunload` handler's async write has no guarantee of completing before the page is torn
 * down. A proper fix would be Realtime Database presence or a Cloud Function heartbeat sweep;
 * this is the lightweight approximation that keeps a merely-stale doc from reading as
 * permanently online in the meantime. */
const STALE_AFTER_MS = 2 * 60 * 1000;

export interface OnlineStatus {
  isOnline: boolean;
  /** ISO string, or null if never recorded / still a pending serverTimestamp() write. */
  lastSeen: string | null;
}

function toStatus(data: Record<string, unknown> | undefined): OnlineStatus {
  const lastSeenValue = data?.lastSeen as { toDate?: () => Date } | undefined;
  const lastSeen = lastSeenValue?.toDate ? lastSeenValue.toDate().toISOString() : null;
  const stale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > STALE_AFTER_MS;
  return { isOnline: data?.isOnline === true && !stale, lastSeen };
}

export async function setOnline(uid: string): Promise<void> {
  try {
    await setDoc(doc(db, ONLINE_STATUS, uid), { isOnline: true, lastSeen: serverTimestamp() }, { merge: true });
  } catch (error) {
    await logError(error, { operation: "onlineStatus.setOnline", uid });
  }
}

export async function setOffline(uid: string): Promise<void> {
  try {
    await setDoc(doc(db, ONLINE_STATUS, uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
  } catch (error) {
    await logError(error, { operation: "onlineStatus.setOffline", uid });
  }
}

/** Real-time listener on one user's presence doc — the DM thread header's "Online"/"Last seen"
 * line and profile pages' status dot. */
export function subscribeToUserStatus(uid: string, callback: (status: OnlineStatus) => void): Unsubscribe {
  return onSnapshot(
    doc(db, ONLINE_STATUS, uid),
    (snap) => callback(toStatus(snap.data())),
    () => callback({ isOnline: false, lastSeen: null })
  );
}

/** One-shot batch fetch for a conversation list or search-results page, where a per-row
 * real-time listener for every contact would be excessive — "roughly current" is enough there,
 * matching this app's existing convention for the Spotify now-playing dots (see
 * MessagesClient.tsx's playingByUid poll). */
export async function getOnlineStatuses(uids: string[]): Promise<Record<string, OnlineStatus>> {
  const entries = await Promise.all(
    uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, ONLINE_STATUS, uid));
        return [uid, toStatus(snap.data())] as const;
      } catch {
        return [uid, { isOnline: false, lastSeen: null }] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}
