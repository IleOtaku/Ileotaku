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

  // Beta feedback bug: "Delete account is not working." Every failure here (and in the two
  // identical logged 500s: adminDeleteUserAccount always got back the generic "Couldn't delete
  // this account." fallback, never a specific reason) came back with that same uninformative
  // message — a strong signal this JSON.parse/cert() call was throwing UNCAUGHT (a malformed
  // FIREBASE_SERVICE_ACCOUNT value — a common Vercel gotcha where the private key's embedded
  // newlines get mangled on paste — throws here, not in the try/catch below it), which Next.js
  // turns into a generic platform 500 HTML page. The client's `res.json()` then fails to parse
  // that as JSON and silently falls back to `{}`, permanently hiding the real reason. Wrapping
  // this in its own try/catch surfaces the actual error message instead.
  if (!getApps().length) {
    try {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
    } catch (error) {
      return Response.json(
        {
          error: `Server credentials are misconfigured: ${error instanceof Error ? error.message : "invalid FIREBASE_SERVICE_ACCOUNT"}. Check the FIREBASE_SERVICE_ACCOUNT value in Vercel's environment variables.`,
        },
        { status: 500 }
      );
    }
  }

  const db = getFirestore();

  try {
    // Verify the caller is actually an admin before doing anything destructive — the client
    // only ever shows this action to an admin, but the server can't trust that alone.
    const adminDoc = await db.collection("users").doc(adminUid).get();
    if (!adminDoc.exists || adminDoc.data()?.isAdmin !== true) {
      return Response.json({ error: "Unauthorized." }, { status: 403 });
    }

    // Beta feedback bug: "as the main admin everything ought to work, i should be able to delete
    // all accounts except zamyilton's." The client already disables/hides the delete action for
    // the founder account, but that's UI-only — a direct call to this route would bypass it, so
    // the founder flag is re-checked here server-side as the real source of truth.
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (targetDoc.exists && targetDoc.data()?.isFounder === true) {
      return Response.json({ error: "The founder account can't be deleted." }, { status: 403 });
    }

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
