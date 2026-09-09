/**
 * ÍléOtaku Cloud Functions.
 *
 * sendPushOnNotification: fires whenever a document is created under
 * `users/{uid}/notifications/{notifId}` (every in-app notification ÍléOtaku already writes —
 * new follower, chapter alert, moderation action, announcement, etc.) and delivers the same
 * title/body to every FCM token registered on that user's profile (see lib/fcm.ts, which is
 * what populates `fcmTokens`). This is the server half of push notifications — the client never
 * sends pushes directly, it only ever creates the Firestore notification document and this
 * function fans it out.
 *
 * Deploy: `cd functions && npm install && npm run deploy` (requires the project to be on the
 * Blaze pay-as-you-go plan — Cloud Functions cannot deploy on the free Spark plan).
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

export const sendPushOnNotification = onDocumentCreated(
  "users/{uid}/notifications/{notifId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { uid } = event.params;
    const notification = snap.data() as {
      title?: string;
      body?: string;
      actionURL?: string;
    };
    if (!notification?.title) return;

    const userSnap = await db.collection("users").doc(uid).get();
    const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
    if (tokens.length === 0) return;

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: notification.title,
        body: notification.body ?? "",
      },
      data: {
        url: notification.actionURL ?? "/",
      },
      webpush: {
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-96.png",
        },
        fcmOptions: {
          link: notification.actionURL ?? "/",
        },
      },
    });

    // Prune tokens the client has since revoked/uninstalled — sendEachForMulticast reports
    // these as "unregistered"/"invalid-argument" per-token rather than failing the whole call.
    const invalidTokens = response.responses
      .map((r, i) => (!r.success && isInvalidTokenError(r.error?.code) ? tokens[i] : null))
      .filter((t): t is string => t !== null);

    if (invalidTokens.length > 0) {
      await db
        .collection("users")
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
      logger.info(`Removed ${invalidTokens.length} invalid FCM token(s) for user ${uid}`);
    }
  }
);

function isInvalidTokenError(code: string | undefined): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token" ||
    code === "messaging/invalid-argument"
  );
}
