import { NextResponse } from "next/server";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { adminDb, authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Applies `data` to every ref, 400 writes per batch (the limit is 500). */
async function updateAll(db: Firestore, refs: DocumentReference[], data: Record<string, unknown>): Promise<number> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.update(ref, data));
    await batch.commit();
  }
  return refs.length;
}

/**
 * POST -> re-stamps the CALLER's current display name and photo onto every copy of them that other
 * documents carry: feed posts, feed comments, series comments, stories, saved-post snapshots, published
 * series, and each conversation's member list (past AND present). Beta feedback: "When I update display
 * name, it should update everywhere for everyone on past and present posts, etc."
 *
 * Runs on the server because the client can't do it: comments live in per-post subcollections that only a
 * collection-group query can reach, and the security rules (rightly) don't let one user's browser rewrite
 * other documents in bulk. The name and photo are read from the caller's own profile document here, never
 * from the request body, so nobody can use this route to stamp an arbitrary name on their content.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const uid = caller.uid;
    const displayName = typeof caller.profile.displayName === "string" ? caller.profile.displayName : "";
    if (!displayName) return NextResponse.json({ success: false, message: "Your profile has no display name." }, { status: 400 });
    const photoURL = typeof caller.profile.photoURL === "string" ? caller.profile.photoURL : "";
    const db = adminDb();

    const feedShape = { displayName, ...(photoURL ? { photoURL } : {}) };
    const [posts, feedComments, seriesComments, stories, saved, series, conversations] = await Promise.all([
      db.collection("creatorFeed").where("uid", "==", uid).get(),
      db.collectionGroup("comments").where("uid", "==", uid).get(),
      db.collectionGroup("comments").where("userId", "==", uid).get(),
      db.collection("stories").where("uid", "==", uid).get(),
      db.collectionGroup("savedPosts").where("uid", "==", uid).get(),
      db.collection("publishedSeries").where("authorId", "==", uid).get(),
      db.collection("conversations").where("participants", "array-contains", uid).get(),
    ]);

    const counts = {
      posts: await updateAll(db, posts.docs.map((d) => d.ref), feedShape),
      feedComments: await updateAll(db, feedComments.docs.map((d) => d.ref), feedShape),
      seriesComments: await updateAll(db, seriesComments.docs.map((d) => d.ref), {
        userName: displayName,
        ...(photoURL ? { userPhotoURL: photoURL } : {}),
      }),
      stories: await updateAll(db, stories.docs.map((d) => d.ref), feedShape),
      savedPosts: await updateAll(db, saved.docs.map((d) => d.ref), feedShape),
      series: await updateAll(db, series.docs.map((d) => d.ref), {
        authorName: displayName,
        ...(photoURL ? { authorPhotoURL: photoURL } : {}),
      }),
      conversations: await updateAll(db, conversations.docs.map((d) => d.ref), {
        [`participantNames.${uid}`]: displayName,
        ...(photoURL ? { [`participantPhotos.${uid}`]: photoURL } : {}),
      }),
    };
    return NextResponse.json({ success: true, updated: counts });
  });
}
