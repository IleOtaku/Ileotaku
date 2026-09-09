/**
 * Sprint 10 — pre-launch beta data wipe. Deletes every account, post, and piece of platform
 * activity generated during the closed beta, keeping only the seeded admin account (and its
 * coins/history/stats reset to a clean baseline) so the platform is ready to open to real users.
 *
 * DESTRUCTIVE AND IRREVERSIBLE. Run this exactly once, right before public launch, never on a
 * whim — there is no confirmation prompt by design (this is meant to run non-interactively in a
 * deploy pipeline), so the person invoking it is the confirmation.
 *
 * Requires serviceAccountKey.json in the project root — see scripts/seed-admin.js's own header
 * for how to generate one.
 *
 * Usage: node scripts/wipe-beta-data.js
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const ADMIN_EMAIL = "admin@ileotaku.com";

// Every users/{uid} subcollection this app writes to (mirrors lib/auth.ts's deleteMyAccount() and
// scripts/check-inactive-accounts.js's USER_SUBCOLLECTIONS, plus the two Sprint 9e added —
// `blocked` and `readingActivity` — that neither of those lists had picked up yet). Deleting a
// user's parent doc never cascades to these in Firestore, so each one has to be swept explicitly
// or it's simply orphaned: unreachable from the UI, but still real data sitting in the database.
const USER_SUBCOLLECTIONS = [
  "history",
  "transactions",
  "unlocked",
  "notifications",
  "drafts",
  "spotifyAuth",
  "nowPlaying",
  "blocked",
  "readingActivity",
];

// Flat, no-subcollection collections wiped entirely in Step 2. `creatorFeed` is deliberately NOT
// listed here even though the sprint brief names it alongside these — Step 5 below handles it
// specifically (delete every post except the admin's own), which both satisfies "wipe the beta
// feed" and avoids wiping it twice with conflicting rules about what survives.
const FLAT_COLLECTIONS_TO_WIPE = [
  "reports",
  "bugReports",
  "errors",
  "listenSessions",
  "mangaStats",
  "betaFeedback",
  "announcements",
];

// Collections that carry their own subcollections and need a recursive delete, not a flat one.
// `chats` is this app's original, now-unused top-level chat collection; `chatRooms` (with each
// room's `messages` subcollection) is the one actually read/written by lib/firestore.ts today —
// both are wiped so this works regardless of which schema any given account's data is under.
const NESTED_COLLECTIONS_TO_WIPE = ["chats", "chatRooms"];

function initAdminApp() {
  const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`
❌ serviceAccountKey.json not found at:
   ${serviceAccountPath}

This script authenticates as an admin using a Firebase service account key — see
scripts/seed-admin.js's own header for how to download one (Firebase Console → Project
Settings → Service Accounts → Generate new private key), then save it as
serviceAccountKey.json in the project root.
`);
    process.exit(1);
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const serviceAccount = require(serviceAccountPath);
  return initializeApp({ credential: cert(serviceAccount) });
}

/** Deletes every doc in a flat collection, batched to stay under Firestore's
 * 500-writes-per-batch limit — same shape as check-inactive-accounts.js's own helper. */
async function deleteAllDocs(colRef) {
  let deleted = 0;
  for (;;) {
    const snap = await colRef.limit(450).get();
    if (snap.empty) return deleted;
    const batch = colRef.firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 450) return deleted;
  }
}

async function main() {
  const app = initAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let adminUid;
  try {
    adminUid = (await auth.getUserByEmail(ADMIN_EMAIL)).uid;
  } catch {
    console.error(`❌ No Auth user found for ${ADMIN_EMAIL} — run scripts/seed-admin.js first.`);
    process.exit(1);
  }
  console.log(`Admin account: ${ADMIN_EMAIL} (${adminUid}) — preserved throughout.\n`);

  // ---------------- Step 1: Auth accounts ----------------
  console.log("Step 1/5 — Deleting non-admin Firebase Auth accounts...");
  let deletedAuthCount = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const toDelete = page.users.map((u) => u.uid).filter((uid) => uid !== adminUid);
    // deleteUsers() takes up to 1000 uids per call — exactly what a listUsers() page returns.
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      if (chunk.length === 0) continue;
      const result = await auth.deleteUsers(chunk);
      deletedAuthCount += result.successCount;
      if (result.failureCount > 0) {
        result.errors.forEach((e) => console.error(`  ⚠️  Failed to delete auth uid at index ${e.index}:`, e.error.message));
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`Deleted ${deletedAuthCount} auth accounts\n`);

  // ---------------- Step 2: flat + nested platform collections ----------------
  console.log("Step 2/5 — Clearing platform activity collections...");
  let collectionsCleared = 0;
  for (const name of FLAT_COLLECTIONS_TO_WIPE) {
    const count = await deleteAllDocs(db.collection(name));
    console.log(`  ${name}: ${count} document(s) deleted`);
    collectionsCleared++;
  }
  for (const name of NESTED_COLLECTIONS_TO_WIPE) {
    const snap = await db.collection(name).get();
    for (const roomDoc of snap.docs) {
      await db.recursiveDelete(roomDoc.ref);
    }
    console.log(`  ${name}: ${snap.size} document(s) (with subcollections) deleted`);
    collectionsCleared++;
  }
  console.log(`Cleared ${collectionsCleared} collections\n`);

  // ---------------- Step 3: user profiles (+ their subcollections) ----------------
  console.log("Step 3/5 — Deleting non-admin user profiles and their subcollections...");
  const usersSnap = await db.collection("users").get();
  let deletedUserCount = 0;
  for (const userDoc of usersSnap.docs) {
    if (userDoc.id === adminUid) continue;
    for (const sub of USER_SUBCOLLECTIONS) {
      await deleteAllDocs(userDoc.ref.collection(sub));
    }
    await userDoc.ref.delete();
    deletedUserCount++;
  }
  console.log(`Deleted ${deletedUserCount} user profiles\n`);

  // ---------------- Step 4: reset the admin doc to a clean baseline ----------------
  console.log("Step 4/5 — Resetting admin account stats...");
  await db.collection("users").doc(adminUid).update({
    coins: 99999,
    history: [],
    readingList: [],
    coinHistory: [],
    streakDays: [],
    streak: 0,
    chaptersRead: 0,
  });
  console.log("Admin coins reset to 99999, history/readingList/coinHistory/streakDays cleared.\n");

  // ---------------- Step 5: creatorFeed posts, admin's own preserved ----------------
  console.log("Step 5/5 — Deleting feed posts not authored by admin...");
  const postsSnap = await db.collection("creatorFeed").get();
  let deletedPostCount = 0;
  const batchesNeeded = [];
  let currentBatch = db.batch();
  let opsInBatch = 0;
  for (const postDoc of postsSnap.docs) {
    const data = postDoc.data();
    const authorId = data.authorId ?? data.uid; // this app's actual field is `uid`; `authorId`
    // is kept as a fallback in case an older/differently-shaped doc used it instead.
    if (authorId === adminUid) continue;
    currentBatch.delete(postDoc.ref);
    opsInBatch++;
    deletedPostCount++;
    if (opsInBatch === 450) {
      batchesNeeded.push(currentBatch);
      currentBatch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) batchesNeeded.push(currentBatch);
  for (const batch of batchesNeeded) await batch.commit();
  console.log(`Deleted ${deletedPostCount} feed post(s)\n`);

  console.log(
    `✅ Beta data wiped. ${deletedUserCount} users deleted. ${deletedPostCount} posts deleted. ` +
      `${collectionsCleared} collections cleared. Platform ready for real users.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Wipe failed:", error);
    process.exit(1);
  });
