import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { NotificationType, type UserProfile } from "@/types";

const USERS = "users";
/** Top-level dedup marker, one doc per uid — see notifyBirthdayIfNotAlready's own doc comment
 * for why this exists at all. */
const BIRTHDAY_NOTIFIED = "birthdayNotified";

/** "MM-DD", always in UTC — matching this app's other date-bucketing (see lib/admin.ts's
 * getRevenueLast7Days fix) so "today" never depends on whichever timezone happens to load the
 * home feed first and silently disagrees with everyone else's. */
function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(5, 10);
}

export function isBirthdayToday(birthday: string | null | undefined, date: Date = new Date()): boolean {
  return !!birthday && birthday === todayKey(date);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "03-15" -> "March 15" — for public-profile display. Never includes a year (there isn't one
 * stored). Returns null for an absent/malformed value so callers can `&&` it away cleanly. */
export function formatBirthday(birthday: string | null | undefined): string | null {
  const match = birthday?.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAMES[Number(match[1]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[2])}`;
}

export interface BirthdayUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  /** Kept so the caller can fan the "is celebrating" notification out to them without a second
   * profile fetch — see notifyBirthdayIfNotAlready. */
  followers: string[];
}

/** Beta feedback: a birthday feature. Every account (app-wide, not scoped to the caller's own
 * following list — that filtering happens separately, see HomeClient) whose `birthday` (MM-DD,
 * no year) matches today. A single equality filter on a publicly-readable collection, so this
 * needs no composite index and no rule change. */
export async function checkTodaysBirthdays(): Promise<BirthdayUser[]> {
  try {
    const key = todayKey();
    const snap = await getDocs(query(collection(db, USERS), where("birthday", "==", key)));
    return snap.docs.map((d) => {
      const data = d.data() as UserProfile;
      return {
        uid: d.id,
        displayName: data.displayName,
        photoURL: data.photoURL,
        followers: data.followers ?? [],
      };
    });
  } catch (error) {
    await logError(error, { operation: "birthday.checkTodaysBirthdays" });
    return [];
  }
}

/**
 * Fires the birthday notifications ("Happy Birthday" to `uid`, "so-and-so is celebrating" to
 * every follower) exactly once per real calendar day, no matter how many different viewers'
 * home-feed loads happen to call this for the same birthday person on the same day — this is
 * deliberately callable from every viewer's client (STEP: "Birthday check runs on home feed
 * load, lazy, not cron") rather than from one privileged process, so a `birthdayNotified/{uid}`
 * marker doc (storing the full "YYYY-MM-DD" the fan-out last ran, not just "MM-DD" — that
 * distinction matters so a birthday that falls on the same MM-DD next year notifies again)
 * de-dupes every call after the first. Best-effort throughout: a missed birthday notification is
 * disappointing, not something that should break the home feed.
 */
export async function notifyBirthdayIfNotAlready(user: BirthdayUser): Promise<void> {
  try {
    const todayFull = new Date().toISOString().slice(0, 10);
    const markerRef = doc(db, BIRTHDAY_NOTIFIED, user.uid);
    const marker = await getDoc(markerRef);
    if (marker.exists() && marker.data().lastNotifiedDate === todayFull) return;
    await setDoc(markerRef, { lastNotifiedDate: todayFull });

    await createNotification(
      user.uid,
      NotificationType.BIRTHDAY,
      "Happy Birthday! 🎂",
      "🎂 Happy Birthday from ÍléOtaku! Wishing you a great day.",
      "/profile"
    ).catch(() => {});

    user.followers
      .filter((followerUid) => followerUid !== user.uid)
      .forEach((followerUid) => {
        createNotification(
          followerUid,
          NotificationType.BIRTHDAY,
          "Birthday today! 🎂",
          `${user.displayName} is celebrating their birthday today! 🎂`,
          `/profile/${user.uid}`,
          user.photoURL
        ).catch(() => {});
      });
  } catch (error) {
    await logError(error, { operation: "birthday.notifyBirthdayIfNotAlready", uid: user.uid });
  }
}
