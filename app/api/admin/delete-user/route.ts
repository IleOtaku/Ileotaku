import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * Server-side account deletion. The client Firebase SDK can only ever call deleteUser() on
 * whichever account is CURRENTLY signed into the browser — there's no client-side way to delete
 * a different uid's Auth record. This route runs with the Admin SDK (server-only credentials,
 * never exposed to the browser) so an admin can actually remove both the Auth account and its
 * Firestore data in one action, rather than the old client-only path that only ever erased
 * Firestore data and left the person able to sign back in.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (see app/api/notifications/send/route.ts for the same
 * pattern) in the server environment.
 */
export async function POST(request: Request) {
  const { targetUid, adminUid } = await request.json();

  if (!targetUid || !adminUid) {
    return Response.json({ error: "Missing targetUid or adminUid." }, { status: 400 });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return Response.json({ error: "FIREBASE_SERVICE_ACCOUNT is not configured." }, { status: 500 });
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }

  const db = getFirestore();

  // Verify the caller is actually an admin before doing anything destructive — the client only
  // ever shows this action to an admin, but the server can't trust that alone.
  const adminDoc = await db.collection("users").doc(adminUid).get();
  if (!adminDoc.exists || adminDoc.data()?.isAdmin !== true) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  try {
    // Delete the Firebase Auth account first — if this fails (e.g. the uid never had one, or
    // was already removed), we still want the Firestore cleanup below to run so a partially-
    // deleted account doesn't linger.
    await getAuth()
      .deleteUser(targetUid)
      .catch((error) => {
        if (error?.code !== "auth/user-not-found") throw error;
      });

    // Delete every known per-user subcollection.
    const collections = [
      "notifications",
      "history",
      "transactions",
      "progress",
      "unlocked",
      "blocked",
      "drafts",
      "savedPosts",
      "spotifyAuth",
      "nowPlaying",
      "readingActivity",
    ];
    for (const col of collections) {
      const snap = await db.collection("users").doc(targetUid).collection(col).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete their feed posts.
    const postsSnap = await db.collection("creatorFeed").where("uid", "==", targetUid).get();
    if (!postsSnap.empty) {
      const batch = db.batch();
      postsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await db.collection("users").doc(targetUid).delete();

    await db.collection("deletedAccounts").add({
      targetUid,
      deletedBy: adminUid,
      deletedAt: new Date().toISOString(),
      reason: "admin_deletion",
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Deletion failed." },
      { status: 500 }
    );
  }
}
