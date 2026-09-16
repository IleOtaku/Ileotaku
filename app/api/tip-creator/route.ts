import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NotificationType } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Error log bug: "Missing or insufficient permissions" on tipCreator, every single time. Root
 * cause — lib/payments.ts's old tipCreator() credited the RECIPIENT's coin balance with a plain
 * client-side updateDoc() on users/{toCreatorId}, executed under the SENDER's own auth — but
 * firestore.rules' users/{uid} update rule only lets an account write its OWN document (plus a
 * narrow followers/following carve-out for the follow graph). That write was structurally
 * guaranteed to fail: the sender's own balance got deducted, then the very next write threw,
 * so the creator never actually received their share and neither side got a transaction record.
 *
 * A client-writable "credit someone else's coins" rule isn't safe to add (any signed-in user
 * could set their OWN or anyone else's balance to whatever they want) — this needs real
 * server-side authority instead, matching this app's existing pattern of moving anything
 * cross-user-and-sensitive into a Vercel serverless function backed by firebase-admin
 * (app/api/notifications/send/route.ts). The idToken is verified server-side via
 * getAuth().verifyIdToken() so a caller can never claim to be someone else's `fromUserId` — the
 * one thing a bare client Firestore rule would otherwise have protected against.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (same as the notifications-send route) in the server
 * environment.
 */
export async function POST(request: Request) {
  const { idToken, toCreatorId, coins, mangaId } = await request.json();

  if (!idToken || !toCreatorId || typeof coins !== "number" || coins <= 0) {
    return Response.json({ success: false, message: "Invalid tip request." }, { status: 400 });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return Response.json(
      { success: false, message: "FIREBASE_SERVICE_ACCOUNT is not configured." },
      { status: 500 }
    );
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }

  let fromUserId: string;
  try {
    fromUserId = (await getAuth().verifyIdToken(idToken)).uid;
  } catch {
    return Response.json({ success: false, message: "Your session has expired — please sign in again." }, { status: 401 });
  }

  if (fromUserId === toCreatorId) {
    return Response.json({ success: false, message: "You can't tip yourself." }, { status: 400 });
  }

  const db = getFirestore();
  const senderRef = db.collection("users").doc(fromUserId);
  const creatorRef = db.collection("users").doc(toCreatorId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [senderSnap, creatorSnap] = await Promise.all([tx.get(senderRef), tx.get(creatorRef)]);
      if (!senderSnap.exists) throw new Error("SENDER_NOT_FOUND");
      if (!creatorSnap.exists) throw new Error("CREATOR_NOT_FOUND");

      const sender = senderSnap.data()!;
      const creator = creatorSnap.data()!;
      if ((sender.coins ?? 0) < coins) throw new Error("INSUFFICIENT_BALANCE");

      const creatorShare = Math.round(coins * 0.65 * 100) / 100;
      const senderBalance = sender.coins - coins;
      const creatorBalance = (creator.coins ?? 0) + creatorShare;

      tx.update(senderRef, { coins: senderBalance });
      tx.update(creatorRef, { coins: creatorBalance });

      const now = new Date().toISOString();
      tx.set(senderRef.collection("transactions").doc(), {
        userId: fromUserId,
        type: "spend",
        amount: -coins,
        balanceAfter: senderBalance,
        description: `Tipped ${creator.displayName ?? "a creator"}`,
        category: "tip",
        ...(mangaId ? { relatedMangaId: mangaId } : {}),
        createdAt: now,
      });
      tx.set(creatorRef.collection("transactions").doc(), {
        userId: toCreatorId,
        type: "reward",
        amount: creatorShare,
        balanceAfter: creatorBalance,
        description: `Tip received from ${sender.displayName ?? "a reader"}`,
        category: "tip",
        ...(mangaId ? { relatedMangaId: mangaId } : {}),
        createdAt: now,
      });

      return { senderDisplayName: sender.displayName as string | undefined };
    });

    // Best-effort notification — never blocks the tip itself.
    try {
      await db.collection("users").doc(toCreatorId).collection("notifications").add({
        type: NotificationType.COINS_RECEIVED,
        title: "You got tipped!",
        body: `${result.senderDisplayName ?? "Someone"} tipped you ${coins} coins.`,
        actionURL: "/profile",
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal.
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const friendly =
      message === "INSUFFICIENT_BALANCE"
        ? "Not enough coins for this tip."
        : message === "CREATOR_NOT_FOUND"
          ? "This creator isn't set up to receive tips yet."
          : "Couldn't complete the tip. Please try again.";
    return Response.json({ success: false, message: friendly }, { status: 400 });
  }
}
