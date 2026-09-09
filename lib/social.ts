import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { followCreator, getUserProfile, unfollowCreator } from "./firestore";
import { createNotification } from "./notifications";
import { NotificationType, type UserProfile } from "@/types";

/**
 * Follows/unfollows are stored as `following`/`followers` uid arrays directly on each user's
 * profile doc (via followCreator/unfollowCreator in lib/firestore.ts) rather than a separate
 * subcollection — that graph already exists and is what /creator/[handle] and the profile page
 * read follower counts from, so this layers the new social behaviors (a notification on
 * follow, resolving followers/following to full profiles) on top of it instead of forking a
 * second source of truth.
 */

export async function followUser(currentUid: string, targetUid: string): Promise<void> {
  if (currentUid === targetUid) return;
  try {
    await followCreator(currentUid, targetUid);
    const me = await getUserProfile(currentUid);
    await createNotification(
      targetUid,
      NotificationType.NEW_FOLLOWER,
      "New follower",
      `${me?.displayName ?? "Someone"} started following you.`,
      me?.handle ? `/creator/${me.handle}` : "/profile",
      me?.photoURL
    );
  } catch (error) {
    await logError(error, { operation: "followUser", currentUid, targetUid });
    throw error;
  }
}

export async function unfollowUser(currentUid: string, targetUid: string): Promise<void> {
  await unfollowCreator(currentUid, targetUid);
}

export async function isFollowing(currentUid: string, targetUid: string): Promise<boolean> {
  const profile = await getUserProfile(currentUid);
  return profile?.following?.includes(targetUid) ?? false;
}

async function resolveProfiles(uids: string[]): Promise<UserProfile[]> {
  const profiles = await Promise.all(uids.map((id) => getUserProfile(id)));
  return profiles.filter((p): p is UserProfile => p !== null);
}

export async function getFollowers(uid: string): Promise<UserProfile[]> {
  const profile = await getUserProfile(uid);
  return resolveProfiles(profile?.followers ?? []);
}

export async function getFollowing(uid: string): Promise<UserProfile[]> {
  const profile = await getUserProfile(uid);
  return resolveProfiles(profile?.following ?? []);
}

/** Saves a series to the user's library — the same readingList array Continue Reading and the
 * profile's Library tab already read from, so "following" a series shows up there immediately. */
export async function followSeries(
  uid: string,
  seriesId: string,
  _seriesTitle: string
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { readingList: arrayUnion(seriesId) });
}

export async function unfollowSeries(uid: string, seriesId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { readingList: arrayRemove(seriesId) });
}
