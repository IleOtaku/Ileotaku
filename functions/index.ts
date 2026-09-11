/**
 * ÍléOtaku Cloud Functions.
 *
 * sendPushOnNotification: fires whenever a document is created under
 * `users/{uid}/notifications/{notifId}` (every in-app notification ÍléOtaku already writes —
 * new follower, chapter alert, moderation action, announcement, etc.) and delivers the same
 * title/body to every FCM token registered on that user's profile (see lib/fcm.ts, which is
 * what populates `fcmTokens`).
 *
 * SUPERSEDED by app/api/notifications/send/route.ts: lib/notifications.ts's createNotification()
 * now calls that Next.js API route directly (a plain Vercel serverless function, needing no
 * Blaze-plan upgrade or separate `firebase deploy`), so this function is redundant wherever the
 * app already runs that code path. If this function is deployed on this project, undeploy it —
 * `firebase functions:delete sendPushOnNotification` — to avoid every push notification being
 * sent twice. Left in the repo only in case a future need for a Firestore-trigger-based delivery
 * path (independent of the Next.js app, e.g. a push sent by another backend service) comes up.
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
