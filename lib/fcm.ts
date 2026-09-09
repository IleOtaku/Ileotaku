import { getToken, getMessaging, isSupported, onMessage } from "firebase/messaging";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import app, { db } from "./firebase";
import { logError } from "./errorLogger";

export type NotificationPermissionStatus = "granted" | "denied" | "default" | "unsupported";

/** Reads the current browser notification permission without prompting — used to render
 * Enabled/Disabled/Not asked in Settings. */
export function getNotificationPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Asks the browser for notification permission, then (if granted) registers for an FCM token
 * and saves it to the user's `fcmTokens` array in Firestore — a Cloud Function
 * (functions/index.ts) delivers pushes to every token in that array whenever a notification
 * document is created. Requires NEXT_PUBLIC_FIREBASE_VAPID_KEY (from the Firebase Console's
 * Cloud Messaging settings) to be set.
 */
export async function requestNotificationPermission(uid: string): Promise<NotificationPermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";

  const supported = await isSupported().catch(() => false);
  if (!supported) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      throw new Error("NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured");
    }
    const registration = await navigator.serviceWorker.ready.catch(() => undefined);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      ...(registration ? { serviceWorkerRegistration: registration } : {}),
    });
    if (token) {
      await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    }
  } catch (error) {
    await logError(error, { operation: "fcm.requestNotificationPermission", uid });
  }

  return "granted";
}

/** Foreground message listener — fires while the app tab is open and focused (background
 * messages instead reach public/sw.js's own `push` event handler). Returns an unsubscribe
 * function, or null if messaging isn't supported in this browser. */
export async function listenForForegroundMessages(
  callback: (title: string, body: string) => void
): Promise<(() => void) | null> {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    callback(payload.notification?.title ?? "ÍléOtaku", payload.notification?.body ?? "");
  });
}
