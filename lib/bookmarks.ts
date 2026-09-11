import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";

/**
 * Dedicated `bookmarks/{workId}/users/{uid}` subcollection — kept alongside (not instead of) the
 * profile's own `readingList` array, which still powers the personal Library tab. This exists
 * purely so the manga detail page's live bookmark count can subscribe to one small collection
 * scoped to a single work, instead of a project-wide `readingList array-contains` query across
 * every user. AddToLibraryButton writes to both on the same click.
 */
function bookmarkDocRef(workId: string, uid: string) {
  return doc(db, "bookmarks", workId, "users", uid);
}

export async function addBookmark(workId: string, uid: string): Promise<void> {
  try {
    await setDoc(bookmarkDocRef(workId, uid), { uid, bookmarkedAt: serverTimestamp() });
  } catch (error) {
    await logError(error, { operation: "bookmarks.addBookmark", workId, uid });
    throw error;
  }
}

export async function removeBookmark(workId: string, uid: string): Promise<void> {
  try {
    await deleteDoc(bookmarkDocRef(workId, uid));
  } catch (error) {
    await logError(error, { operation: "bookmarks.removeBookmark", workId, uid });
    throw error;
  }
}

/** Live bookmark count for one work's header stats strip — updates the instant anyone
 * bookmarks/unbookmarks it, with no manual refresh. A plain collection listener (reading every
 * doc) rather than a count() aggregation query — this codebase doesn't use aggregation queries
 * anywhere else, and a single work's bookmark collection is small enough that this is cheap. */
export function subscribeToBookmarkCount(workId: string, callback: (count: number) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "bookmarks", workId, "users"),
    (snap) => callback(snap.size),
    () => callback(0)
  );
}
