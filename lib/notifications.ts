import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
import { NotificationType, type AppNotification } from "@/types";

function notificationsCollection(uid: string) {
  return collection(db, "users", uid, "notifications");
}

/** Writes one new notification to users/{uid}/notifications. Any signed-in user may call this
 * for any target uid — it's how cross-user events (a follow, a reply, a tip) notify someone
 * else; read/update/delete stay locked to the notification's own owner (see firestore.rules). */
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
