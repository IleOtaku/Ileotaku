import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { NotificationType, type AppNotification, type NotificationCategoryPreferences } from "@/types";

function notificationsCollection(uid: string) {
  return collection(db, "users", uid, "notifications");
}

/** Maps a NotificationType to the Settings → Notifications preference key that gates its push
 * delivery — see NotificationCategoryPreferences' own doc comment. A type with no entry here
 * (moderation actions, Platinum billing notices, achievements, ...) is never suppressible: it
 * always sends, the same as before this preference system existed. */
const PUSH_PREFERENCE_KEY: Partial<Record<NotificationType, keyof NotificationCategoryPreferences>> = {
  [NotificationType.NEW_CHAPTER]: "newChapterFollowedCreator",
  [NotificationType.COMMENT_REPLY]: "commentReply",
  [NotificationType.NEW_FOLLOWER]: "newFollower",
  [NotificationType.GROUP_MENTION]: "mention",
  [NotificationType.WORK_APPROVED]: "workApprovedRejected",
  [NotificationType.WORK_REJECTED]: "workApprovedRejected",
  [NotificationType.COINS_RECEIVED]: "tipReceived",
  [NotificationType.ANNOUNCEMENT]: "announcements",
  [NotificationType.PROFILE_VISIT]: "profileVisit",
  [NotificationType.POST_LIKE]: "postLike",
};

/** Whether `type`'s push should actually go out for a profile carrying `prefs` — absent
 * preferences (the whole object, or just this one key) default to "on", per the spec's "not set
 * = default all on". The in-app notification (already written by the time this is checked) is
 * never gated by this, only the device push. */
function isPushEnabled(type: NotificationType, prefs: NotificationCategoryPreferences | undefined): boolean {
  const key = PUSH_PREFERENCE_KEY[type];
  if (!key) return true;
  return prefs?.[key] !== false;
}

/** Delivers one push notification to every FCM token on `uid`'s profile via
 * app/api/notifications/send/route.ts (a plain server-side fetch, not a Cloud Function — see
 * that route's own comment for why). Best-effort: a delivery failure never blocks the in-app
 * notification this always accompanies. A token the API reports as no-longer-registered is
 * pruned from the profile so it isn't retried on the next notification. */
async function sendPushToUser(uid: string, type: NotificationType, title: string, body: string, url: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    if (!isPushEnabled(type, snap.data().notificationPreferences)) return;
    const tokens: string[] = snap.data().fcmTokens ?? [];
    if (tokens.length === 0) return;

    const results = await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch("/api/notifications/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, title, body, url }),
          });
          const data = await res.json().catch(() => ({}));
          return { token, notRegistered: data?.notRegistered === true };
        } catch {
          return { token, notRegistered: false };
        }
      })
    );

    const staleTokens = results.filter((r) => r.notRegistered).map((r) => r.token);
    if (staleTokens.length > 0) {
      await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(...staleTokens) }).catch(() => {});
    }
  } catch {
    // Non-fatal — push delivery is a bonus on top of the in-app notification, never a
    // requirement for it.
  }
}

/** Writes one new notification to users/{uid}/notifications, then best-effort delivers it as a
 * device push. Any signed-in user may call this for any target uid — it's how cross-user events
 * (a follow, a reply, a tip) notify someone else; read/update/delete stay locked to the
 * notification's own owner (see firestore.rules). */
export async function createNotification(
  uid: string,
  type: NotificationType,
  title: string,
  body: string,
  actionURL: string,
  imageURL?: string
): Promise<void> {
  await addDoc(notificationsCollection(uid), {
    type,
    title,
    body,
    actionURL,
    ...(imageURL ? { imageURL } : {}),
    isRead: false,
    createdAt: new Date().toISOString(),
  });
  await sendPushToUser(uid, type, title, body, actionURL);
}

export async function markAsRead(uid: string, notifId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notifications", notifId), { isRead: true });
}

/** Batch-marks every currently-unread notification as read in one write. */
export async function markAllAsRead(uid: string): Promise<void> {
  const q = query(notificationsCollection(uid), where("isRead", "==", false));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}

export async function deleteNotification(uid: string, notifId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "notifications", notifId));
}

export interface NotificationsSnapshot {
  notifications: AppNotification[];
  unreadCount: number;
}

/**
 * Real-time listener on the latest 20 notifications. `unreadCount` is derived from that same
 * page rather than a separate full-collection query — for a notification bell that's the
 * number that matters in practice, and it avoids a second live listener per mounted bell.
 */
export function subscribeToNotifications(
  uid: string,
  callback: (snapshot: NotificationsSnapshot) => void
): Unsubscribe {
  const q = query(notificationsCollection(uid), orderBy("createdAt", "desc"), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      const notifications = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AppNotification
      );
      const unreadCount = notifications.filter((n) => !n.isRead).length;
      callback({ notifications, unreadCount });
    },
    () => {
      // Not signed in / rules rejected — degrade to an empty, quiet bell rather than throw.
      callback({ notifications: [], unreadCount: 0 });
    }
  );
}
