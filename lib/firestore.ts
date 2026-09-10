import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import {
  NotificationType,
  type ChatMessage,
  type CreatorWork,
  type HistoryEntry,
  type ModerationAction,
  type ReadingProgressEntry,
  type Report,
  type SeriesComment,
  type SeriesMeta,
  type SeriesRating,
  type UserProfile,
} from "@/types";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { createNotification } from "./notifications";

const USERS = "users";
const CREATOR_WORKS = "creatorWorks";
const SERIES = "series";
const REPORTS = "reports";

/* ---------------------------- Users ---------------------------- */

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/** Real-time version of getUserProfile — used for the SIGNED-IN user's own profile (see
 * hooks/useAuth.ts's initAuthListener) so every value on it (coin balance, isPlatinum, follower
 * counts, ...) updates live everywhere the app reads `useAuth().profile`, instead of only
 * refreshing on the specific actions that happened to call `useAuth.getState().setProfile(...)`
 * manually. Not used for reading OTHER users' profiles — those stay one-shot getUserProfile
 * calls, since subscribing to every profile a page happens to render would be a lot of
 * simultaneous listeners for no real benefit over a fresh read. */
export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, USERS, uid),
    (snap) => callback(snap.exists() ? (snap.data() as UserProfile) : null),
    () => callback(null)
  );
}

/** Derives handleLower/displayNameLower from whichever of handle/displayName is present in this
 * write, so every path that can change either one (account creation, editing your profile) keeps
 * the lowercase search fields in sync rather than only setting them once at signup. */
function withLowerFields<T extends Partial<UserProfile>>(data: T): T {
  const patch: Partial<UserProfile> = {};
  if (data.handle !== undefined) patch.handleLower = data.handle.toLowerCase();
  if (data.displayName !== undefined) patch.displayNameLower = data.displayName.toLowerCase();
  return { ...data, ...patch };
}

/** Creates the user's profile document if it doesn't exist yet, merging fields otherwise. Every
 * call also stamps `lastActiveAt` (Sprint 9d's inactivity-deletion clock) — this is the one
 * function every sign-up and sign-in path already goes through, so it's the natural place for
 * that to happen unconditionally rather than something every caller has to remember. */
export async function upsertUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  try {
    const ref = doc(db, USERS, uid);
    const existing = await getDoc(ref);
    const now = new Date().toISOString();
    await setDoc(
      ref,
      {
        ...withLowerFields(data),
        uid,
        createdAt: existing.exists() ? existing.data().createdAt ?? now : now,
        updatedAt: now,
        lastActiveAt: now,
        deletionWarningEmailSent: false,
        scheduledDeletionAt: null,
      },
      { merge: true }
    );
  } catch (error) {
    await logError(error, { operation: "upsertUserProfile", uid });
    throw error;
  }
}

/** Also stamps `lastActiveAt` on every call, same reasoning as upsertUserProfile — this is the
 * function nearly every settings/profile-edit flow in the app already calls to save a change,
 * so "any profile edit counts as activity" falls out of that for free rather than needing every
 * one of those call sites updated individually. */
export async function updateUserPrefs(
  uid: string,
  prefs: Partial<UserProfile>
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    ...withLowerFields(prefs),
    updatedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    deletionWarningEmailSent: false,
    scheduledDeletionAt: null,
  });
}

/** Lightweight activity stamp for flows that don't otherwise write to the profile document at
 * all — a chapter load, a feed post, a DM, a comment. Also clears any pending deletion warning:
 * any sign of life resets the inactivity clock, the same way an actual login does. Never throws
 * into the caller's own flow (reading a chapter shouldn't fail because this one side-effect
 * did); logs and swallows instead. */
export async function updateLastActive(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, USERS, uid), {
      lastActiveAt: new Date().toISOString(),
      deletionWarningEmailSent: false,
      scheduledDeletionAt: null,
    });
  } catch (error) {
    await logError(error, { operation: "updateLastActive", uid });
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, USERS));
  return snap.docs.map((d) => d.data() as UserProfile);
}

/**
 * Substring match on handle/displayName, for the search page's People tab and the Navbar's
 * quick-search dropdown. Firestore has no native "contains" query, so this scans the (already
 * publicly-readable) users collection client-side — fine at this app's scale; a dedicated
 * search index (Algolia, Typesense) would be the right call at real production scale.
 */
export async function searchUsers(term: string): Promise<UserProfile[]> {
  const q = term.trim().toLowerCase().replace(/^@/, "");
  if (!q) return [];
  const all = await getAllUsers();
  return all.filter((u) => {
    const handle = u.handleLower ?? u.handle?.toLowerCase() ?? "";
    const name = u.displayNameLower ?? u.displayName?.toLowerCase() ?? "";
    return handle.includes(q) || name.includes(q);
  });
}

/** The most-followed creators, for "Popular" suggestions when the People tab's search is empty. */
export async function getPopularCreators(take = 6): Promise<UserProfile[]> {
  const all = await getAllUsers();
  return all
    .filter((u) => u.isCreator === true)
    .sort((a, b) => (b.followers?.length ?? 0) - (a.followers?.length ?? 0))
    .slice(0, take);
}

/** Published series count + total reads for one creator, shown on their People-tab result card. */
export async function getCreatorStats(
  uid: string
): Promise<{ publishedCount: number; totalReads: number }> {
  const works = await getCreatorWorks(uid);
  const published = works.filter((w) => w.status === "published");
  return {
    publishedCount: published.length,
    totalReads: published.reduce((sum, w) => sum + (w.views ?? 0), 0),
  };
}

/** Looks up a public creator profile by their @handle, for the /creator/[handle] page. */
export async function getUserByHandle(handle: string): Promise<UserProfile | null> {
  const q = query(collection(db, USERS), where("handle", "==", handle), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data() as UserProfile);
}

export async function followCreator(followerId: string, creatorId: string): Promise<void> {
  await updateDoc(doc(db, USERS, followerId), { following: arrayUnion(creatorId) });
  await updateDoc(doc(db, USERS, creatorId), { followers: arrayUnion(followerId) });
}

export async function unfollowCreator(followerId: string, creatorId: string): Promise<void> {
  await updateDoc(doc(db, USERS, followerId), { following: arrayRemove(creatorId) });
  await updateDoc(doc(db, USERS, creatorId), { followers: arrayRemove(followerId) });
}

/** Saves a manga/series id to the user's personal library. */
export async function addToReadingList(uid: string, mangaId: string): Promise<void> {
  await updateDoc(doc(db, USERS, uid), { readingList: arrayUnion(mangaId) });
}

/** Upserts the user's last-read position for one manga, powering the "Currently Reading" grid. */
export async function updateReadingProgress(
  uid: string,
  mangaId: string,
  entry: ReadingProgressEntry
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), { [`readingProgress.${mangaId}`]: entry });
}

/** Adds one unlocked achievement id to the user's profile (no-op if already unlocked). */
export async function unlockAchievement(uid: string, achievementId: string): Promise<void> {
  await updateDoc(doc(db, USERS, uid), { achievements: arrayUnion(achievementId) });
}

/* ---------------------------- Reading history ---------------------------- */

function historyCollection(uid: string) {
  return collection(db, USERS, uid, "history");
}

/** Returns the new entry's id so the caller (ReaderClient) can later fill in
 * `readingTimeMinutes` via updateHistoryReadingTime() once it knows how long the chapter was
 * actually open for — that duration isn't known yet at the moment reading starts. */
export async function addHistoryEntry(
  uid: string,
  entry: Omit<HistoryEntry, "id" | "readAt">
): Promise<string> {
  const ref = await addDoc(historyCollection(uid), { ...entry, readAt: new Date().toISOString() });
  return ref.id;
}

/** Best-effort — called when the reader leaves a chapter (unmount or chapter change), so a
 * missed update just means that one entry shows no reading-time figure rather than failing the
 * navigation it's piggybacking on. */
export async function updateHistoryReadingTime(
  uid: string,
  historyId: string,
  minutes: number
): Promise<void> {
  if (minutes <= 0) return;
  try {
    await updateDoc(doc(historyCollection(uid), historyId), { readingTimeMinutes: minutes });
  } catch {
    // Non-fatal — see comment above.
  }
}

export async function getHistory(uid: string, take = 20): Promise<HistoryEntry[]> {
  const q = query(historyCollection(uid), orderBy("readAt", "desc"), limit(take));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry);
}

/** How many history entries this user has for one manga — used to gate rating (must have read
 * a few chapters first) since there's no per-series chapter-read counter, only this history log. */
export async function getHistoryCountForManga(uid: string, mangaId: string): Promise<number> {
  const q = query(historyCollection(uid), where("mangaId", "==", mangaId));
  const snap = await getDocs(q);
  return snap.size;
}

/** Deletes every history entry for this user — reading progress (the separate
 * `readingProgress` map field, and `chaptersRead`/streak counters) is untouched, matching the
 * confirmation copy's "your progress on series is kept, only the history log is cleared." */
export async function clearAllHistory(uid: string): Promise<void> {
  const snap = await getDocs(historyCollection(uid));
  await deleteAllInBatches(snap.docs.map((d) => d.ref));
}

export async function deleteHistoryItem(uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(historyCollection(uid), itemId));
}

/** Deletes every history entry older than `days` days — used by the "Clear history older
 * than..." dropdown (1 week / 1 month / 3 months / all time, the last of which just calls
 * clearAllHistory() directly instead of this). */
export async function clearHistoryOlderThan(uid: string, days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const q = query(historyCollection(uid), where("readAt", "<", cutoff));
  const snap = await getDocs(q);
  await deleteAllInBatches(snap.docs.map((d) => d.ref));
}

/** Shared batched-delete helper — chunks of 450 to stay comfortably under Firestore's
 * 500-writes-per-batch limit, same shape as lib/auth.ts's deleteAllDocs. */
async function deleteAllInBatches(refs: ReturnType<typeof doc>[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export interface FriendActivityEntry {
  uid: string;
  displayName: string;
  photoURL?: string;
  mangaId: string;
  title: string;
  coverURL: string;
  readAt: string;
}

/** Reading activity from the last 48h for up to 20 followed users, merged and newest-first.
 * Fans out one query per followed uid — fine at this app's scale, but not something to point
 * at a follow-list of hundreds without adding a denormalized activity feed instead. */
export async function getFriendActivity(
  followingUids: string[],
  take = 15
): Promise<FriendActivityEntry[]> {
  const uids = followingUids.slice(0, 20);
  if (uids.length === 0) return [];

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const perUser = await Promise.all(
    uids.map(async (uid) => {
      const [snap, profile] = await Promise.all([
        getDocs(
          query(historyCollection(uid), where("readAt", ">=", cutoff), orderBy("readAt", "desc"), limit(5))
        ),
        getUserProfile(uid),
      ]);
      return snap.docs.map((d) => {
        const entry = d.data() as HistoryEntry;
        return {
          uid,
          displayName: profile?.displayName ?? "Reader",
          ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
          mangaId: entry.mangaId,
          title: entry.title,
          coverURL: entry.coverURL,
          readAt: entry.readAt,
        } satisfies FriendActivityEntry;
      });
    })
  );

  return perUser
    .flat()
    .sort((a, b) => (a.readAt < b.readAt ? 1 : -1))
    .slice(0, take);
}

/* ---------------------------- Chat ---------------------------- */

export function subscribeToChat(
  roomId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
    },
    (error) => {
      // Security rules require sign-in to read a room's messages — callers should only
      // subscribe once a user is authenticated, but this keeps any such rejection (or a
      // dropped/expired session) from surfacing as an unhandled console error.
      onError?.(error);
    }
  );
}

export async function sendChatMessage(
  roomId: string,
  message: Omit<ChatMessage, "id" | "roomId" | "createdAt">
): Promise<void> {
  try {
    await addDoc(collection(db, "chatRooms", roomId, "messages"), {
      ...message,
      roomId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "sendChatMessage", roomId });
    throw error;
  }
}

/** Edits a live-chat message's own text — the sender only (enforced in firestore.rules too). */
export async function editChatMessage(roomId: string, messageId: string, newContent: string): Promise<void> {
  const trimmed = newContent.trim();
  if (!trimmed) return;
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), {
    text: trimmed,
    isEdited: true,
    editedAt: new Date().toISOString(),
  });
}

/** Soft-deletes a live-chat message: the doc stays with its text replaced by a placeholder,
 * same pattern as DM messages' "delete for everyone" in lib/dms.ts. */
export async function deleteChatMessage(roomId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    text: "This message was deleted",
  });
}

/** Live-updates with just the single newest message — cheap enough to run alongside the full
 * subscribeToChat() listener, used to power the "unread chat" dot without re-fetching the
 * whole room's history. */
export function subscribeToLatestChatMessage(
  roomId: string,
  callback: (message: ChatMessage | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as ChatMessage)),
    (error) => onError?.(error)
  );
}

/** One-time (non-live) fetch of the most recent messages, newest first — used for the
 * lightweight chat preview on the manga detail page rather than a full live subscription. */
export async function getRecentChatMessages(roomId: string, take = 50): Promise<ChatMessage[]> {
  const q = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(take)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
}

/* ------------------------- Creator works ------------------------- */

export async function getCreatorWorks(creatorId: string): Promise<CreatorWork[]> {
  const q = query(collection(db, CREATOR_WORKS), where("creatorId", "==", creatorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CreatorWork);
}

/** Real-time version of getCreatorWorks — the creator dashboard's Works/Earnings tabs use this
 * instead of a one-shot fetch so a work's `earnings` (bumped whenever a reader unlocks one of
 * its chapters) and `views` update live, without the creator needing to refresh to see them. */
export function subscribeToCreatorWorks(
  creatorId: string,
  callback: (works: CreatorWork[]) => void
): Unsubscribe {
  const q = query(collection(db, CREATOR_WORKS), where("creatorId", "==", creatorId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CreatorWork)),
    () => callback([])
  );
}

export async function submitWork(
  work: Omit<CreatorWork, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, CREATOR_WORKS), {
      ...work,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  } catch (error) {
    await logError(error, { operation: "submitWork", creatorId: work.creatorId });
    throw error;
  }
}

export async function updateWorkStatus(
  workId: string,
  status: CreatorWork["status"]
): Promise<void> {
  try {
    await updateDoc(doc(db, CREATOR_WORKS, workId), {
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "updateWorkStatus", workId, status });
    throw error;
  }
}

export async function getAllPendingWorks(): Promise<CreatorWork[]> {
  const q = query(collection(db, CREATOR_WORKS), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CreatorWork);
}

/** Real-time pending-review count — powers the Admin Overview tab's "Pending Reviews" card so
 * it updates the instant a work is submitted or triaged, without needing a manual refresh. */
export function subscribeToPendingWorkCount(callback: (count: number) => void): Unsubscribe {
  const q = query(collection(db, CREATOR_WORKS), where("status", "==", "pending"));
  return onSnapshot(q, (snap) => callback(snap.size), () => callback(0));
}

/* ---------------------------- Comments ---------------------------- */
// Comments (and ratings, below) live under a `series/{mangaId}` doc keyed by the external
// MangaHook id — the catalog itself is served from that API rather than Firestore, so this is
// the lightweight Firestore-side home for social metadata about each title.

function commentsCollection(mangaId: string, chapterId?: string) {
  return chapterId
    ? collection(db, SERIES, mangaId, "chapters", chapterId, "comments")
    : collection(db, SERIES, mangaId, "comments");
}

/** Real-time listener on the most recent `take` comments, newest first. */
export function subscribeToComments(
  mangaId: string,
  chapterId: string | undefined,
  take: number,
  callback: (comments: SeriesComment[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(commentsCollection(mangaId, chapterId), orderBy("createdAt", "desc"), limit(take));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SeriesComment)),
    onError
  );
}

export async function postComment(
  mangaId: string,
  chapterId: string | undefined,
  comment: Omit<SeriesComment, "id" | "createdAt" | "likes">
): Promise<void> {
  try {
    await addDoc(commentsCollection(mangaId, chapterId), {
      ...comment,
      likes: [],
      createdAt: new Date().toISOString(),
    });
    await updateLastActive(comment.userId);
  } catch (error) {
    await logError(error, { operation: "postComment", mangaId, chapterId });
    throw error;
  }
}

export async function toggleCommentLike(
  mangaId: string,
  chapterId: string | undefined,
  commentId: string,
  uid: string,
  currentlyLiked: boolean
): Promise<void> {
  await updateDoc(doc(commentsCollection(mangaId, chapterId), commentId), {
    likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

/** Edits a comment's own text — the author only (enforced in firestore.rules too). */
export async function editComment(
  mangaId: string,
  chapterId: string | undefined,
  commentId: string,
  newText: string
): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;
  await updateDoc(doc(commentsCollection(mangaId, chapterId), commentId), {
    text: trimmed,
    isEdited: true,
    editedAt: new Date().toISOString(),
  });
}

/** Soft-deletes a comment: the doc stays (so any replies under it keep a parent to render
 * against) with its text replaced by a placeholder, rather than a hard delete — same pattern
 * as DM messages' "delete for everyone" in lib/dms.ts. */
export async function deleteComment(
  mangaId: string,
  chapterId: string | undefined,
  commentId: string
): Promise<void> {
  await updateDoc(doc(commentsCollection(mangaId, chapterId), commentId), {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    text: "Comment deleted",
  });
}

/* ---------------------------- Ratings ---------------------------- */

function ratingsCollection(seriesId: string) {
  return collection(db, SERIES, seriesId, "ratings");
}

export async function getSeriesMeta(seriesId: string): Promise<SeriesMeta | null> {
  const snap = await getDoc(doc(db, SERIES, seriesId));
  return snap.exists() ? (snap.data() as SeriesMeta) : null;
}

export async function getUserRating(
  seriesId: string,
  userId: string
): Promise<SeriesRating | null> {
  const snap = await getDoc(doc(ratingsCollection(seriesId), userId));
  return snap.exists() ? (snap.data() as SeriesRating) : null;
}

export async function getRatings(seriesId: string): Promise<SeriesRating[]> {
  const snap = await getDocs(ratingsCollection(seriesId));
  return snap.docs.map((d) => d.data() as SeriesRating);
}

/** Upserts the caller's rating (one per user, keyed by uid) and recomputes the series' average
 * and count. Not transactional — acceptable for this app's scale, where two people rating the
 * same title in the same instant is exceedingly rare — but not safe under heavy concurrent load. */
export async function submitRating(
  seriesId: string,
  userId: string,
  rating: number,
  review?: string,
  isSpoiler?: boolean
): Promise<void> {
  try {
    await setDoc(
      doc(ratingsCollection(seriesId), userId),
      {
        userId,
        rating,
        review: review ?? "",
        isSpoiler: !!isSpoiler,
        createdAt: new Date().toISOString(),
      } satisfies SeriesRating,
      { merge: true }
    );

    const all = await getRatings(seriesId);
    const averageRating = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    await setDoc(
      doc(db, SERIES, seriesId),
      { averageRating, ratingCount: all.length } satisfies SeriesMeta,
      { merge: true }
    );
  } catch (error) {
    await logError(error, { operation: "submitRating", seriesId, userId });
    throw error;
  }
}

/* ---------------------------- Reports ---------------------------- */

export async function submitReport(
  report: Omit<Report, "id" | "createdAt" | "status">
): Promise<void> {
  try {
    await addDoc(collection(db, REPORTS), {
      ...report,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "submitReport", targetType: report.targetType });
    throw error;
  }
}

export async function getPendingReports(): Promise<Report[]> {
  const q = query(collection(db, REPORTS), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Report)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function dismissReport(reportId: string): Promise<void> {
  try {
    await updateDoc(doc(db, REPORTS, reportId), { status: "resolved" });
  } catch (error) {
    await logError(error, { operation: "dismissReport", reportId });
    throw error;
  }
}

const MODERATION_NOTIFICATION_COPY: Record<ModerationAction, { title: string; body: string }> = {
  warn: {
    title: "You've received a warning",
    body: "A moderator reviewed a report about your activity and issued a warning. Please review our community guidelines.",
  },
  suspend7: {
    title: "Your account has been suspended",
    body: "A moderator reviewed a report about your activity and suspended your account for 7 days for violating our community guidelines.",
  },
  ban: {
    title: "Your account has been banned",
    body: "A moderator reviewed a report about your activity and permanently banned your account for violating our community guidelines.",
  },
  delete_content: {
    title: "Content you posted was removed",
    body: "A moderator removed content you posted for violating our community guidelines.",
  },
};

/** Marks a report actioned, applies the matching strike/suspension/ban to the reported user's
 * profile (content deletion alone doesn't touch their account flags), and notifies them of the
 * outcome — every action, deletion included, gets a notification since it's still a moderation
 * decision made about something they posted. */
export async function actionReport(
  reportId: string,
  action: ModerationAction,
  targetUserId?: string
): Promise<void> {
  try {
    await updateDoc(doc(db, REPORTS, reportId), { status: "actioned", actionTaken: action });
    if (!targetUserId) return;

    if (action !== "delete_content") {
      const strikeUpdate = { strikeCount: increment(1) };
      if (action === "warn") {
        await updateDoc(doc(db, USERS, targetUserId), strikeUpdate);
      } else if (action === "suspend7") {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        await updateDoc(doc(db, USERS, targetUserId), {
          ...strikeUpdate,
          suspendedUntil: until.toISOString(),
        });
      } else if (action === "ban") {
        await updateDoc(doc(db, USERS, targetUserId), { ...strikeUpdate, isBanned: true });
      }
    }

    const copy = MODERATION_NOTIFICATION_COPY[action];
    await createNotification(
      targetUserId,
      NotificationType.MODERATION_ACTION,
      copy.title,
      copy.body,
      "/profile"
    );
  } catch (error) {
    await logError(error, { operation: "actionReport", reportId, action, targetUserId });
    throw error;
  }
}
