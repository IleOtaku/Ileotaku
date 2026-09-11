import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export const dynamic = "force-dynamic";

/**
 * Server-side push sender. Runs as a Vercel serverless function via firebase-admin rather than
 * relying on the Firestore-triggered Cloud Function (functions/index.ts's sendPushOnNotification)
 * — that path needs the Firebase project on the Blaze plan and a separate `firebase deploy
 * --only functions`, neither of which this route requires. If that Cloud Function IS deployed
 * on this project, undeploy it (`firebase functions:delete sendPushOnNotification`) once this
 * route is live, since lib/notifications.ts's createNotification() now calls this route directly
 * — running both would double-send every push.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (the full service account JSON, as a single-line string) in
 * the server environment — see .env.example / DEPLOY.md.
 */
export async function POST(request: Request) {
  const { token, title, body, url } = await request.json();

  if (!token || !title) {
    return Response.json({ success: false, error: "Missing token or title." }, { status: 400 });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return Response.json(
      { success: false, error: "FIREBASE_SERVICE_ACCOUNT is not configured." },
      { status: 500 }
    );
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }

  const messaging = getMessaging();
  try {
    await messaging.send({
      token,
      notification: { title, body: body ?? "" },
      data: { url: url ?? "/" },
      webpush: {
        fcmOptions: { link: url || "https://ileotaku.vercel.app" },
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-72.png",
        },
      },
    });
    return Response.json({ success: true });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const notRegistered =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument";
    return Response.json(
      { success: false, notRegistered, error: error instanceof Error ? error.message : String(error) },
      { status: notRegistered ? 410 : 500 }
    );
  }
}
