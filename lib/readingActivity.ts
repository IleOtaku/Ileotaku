import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile } from "./firestore";
import type { ReadingActivity, UserProfile } from "@/types";

const USERS = "users";
const READING_ACTIVITY = "readingActivity";
/** Fixed sub-document id — one live "currently reading" record per user, same pattern as
 * Sprint 9d's nowPlaying/spotifyAuth. */
const DOC_ID = "current";

function activityRef(uid: string) {
  return doc(db, USERS, uid, READING_ACTIVITY, DOC_ID);
}

/** Marks `uid` as actively reading a chapter right now — called on every chapter load from
 * ReaderClient. Overwrites the previous snapshot rather than appending, so the doc is always
 * "what is this person doing right now", not a history log (that's what `history` is for). */
export async function updateReadingActivity(
  uid: string,
  seriesId: string,
  seriesTitle: string,
  chapterId: string,
  chapterTitle: string,
  coverImage: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await setDoc(activityRef(uid), {
      seriesId,
      seriesTitle,
      chapterId,
      chapterTitle,
      coverImage,
      isReading: true,
      startedAt: now,
      lastUpdatedAt: now,
    } satisfies ReadingActivity);
  } catch (error) {
    await logError(error, { operation: "readingActivity.updateReadingActivity", uid });
  }
}

/** Flips `isReading` off (keeping the last series/chapter fields in place, unused by any reader
 * of this doc while `isReading` is false) — called when the reader unmounts or the user
 * navigates away, so "reading now" doesn't linger indefinitely after someone's closed the tab. */
export async function clearReadingActivity(uid: string): Promise<void> {
  try {
    await updateDoc(activityRef(uid), { isReading: false, lastUpdatedAt: new Date().toISOString() });
  } catch {
    // Non-fatal, and expected the first time (no doc exists yet if this user never actually
    // started a chapter this session — updateDoc on a missing doc throws, which is fine to
    // swallow here since "not reading" is already the correct end state either way).
  }
}

export function subscribeToReadingActivity(
  uid: string,
  callback: (activity: ReadingActivity | null) => void
): Unsubscribe {
  return onSnapshot(
    activityRef(uid),
    (snap) => callback(snap.exists() ? (snap.data() as ReadingActivity) : null),
    () => callback(null)
  );
}

/** Whether `viewerUid` is allowed to see `targetUid`'s reading activity, per the target's own
 * privacy settings — mirrors the same precedence NowPlayingCard's privacy check uses, extended
 * with Platinum's extra "followers only" tier (free accounts can only ever be "everyone" or
 * off, per the spec's "that's Platinum exclusive" restriction — enforced here rather than
 * trusted from the stored field, since a free account downgrading from a past Platinum period
 * could otherwise be left with a stale "followers" value that would incorrectly still apply). */
export function canViewReadingActivity(target: UserProfile, viewerUid: string | undefined): boolean {
  if (target.showReadingActivity === false) return false;
  const visibility = target.isPlatinum ? (target.readingActivityVisibility ?? "everyone") : "everyone";
  if (visibility === "everyone") return true;
  if (visibility === "nobody") return false;
  // "followers" — only meaningful for Platinum accounts (guarded above).
  if (!viewerUid) return false;
  return target.followers?.includes(viewerUid) ?? false;
}

export interface FollowingActivityEntry extends ReadingActivity {
  uid: string;
  displayName: string;
  photoURL?: string;
}

/** Reading activity for everyone `uid` follows, newest-first, honoring each followed account's
 * own privacy setting. Fans out one read per followed uid, same acceptable-at-this-scale
 * trade-off as lib/firestore.ts's getFriendActivity(). */
export async function getFollowingActivity(uid: string, take = 8): Promise<FollowingActivityEntry[]> {
  try {
    const me = await getUserProfile(uid);
    const followingUids = (me?.following ?? []).slice(0, 30);
    if (followingUids.length === 0) return [];

    const q = query(collection(db, USERS), where("uid", "in", followingUids));
    const profilesSnap = await getDocs(q);
    const profiles = new Map(profilesSnap.docs.map((d) => [d.id, d.data() as UserProfile]));

    const entries = await Promise.all(
      followingUids.map(async (targetUid) => {
        const profile = profiles.get(targetUid);
        if (!profile || !canViewReadingActivity(profile, uid)) return null;
        const snap = await getDoc(activityRef(targetUid));
        if (!snap.exists()) return null;
        const activity = snap.data() as ReadingActivity;
        if (!activity.isReading) return null;
        return {
          ...activity,
          uid: targetUid,
          displayName: profile.displayName,
          ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
        } satisfies FollowingActivityEntry;
      })
    );

    return entries
      .filter((e): e is FollowingActivityEntry => e !== null)
      .sort((a, b) => (a.lastUpdatedAt < b.lastUpdatedAt ? 1 : -1))
      .slice(0, take);
  } catch (error) {
    await logError(error, { operation: "readingActivity.getFollowingActivity", uid });
    return [];
  }
}
