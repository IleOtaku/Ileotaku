/**
 * Selective beta data wipe — clears platform ACTIVITY (feed posts, stories, coin balances/
 * transaction history, reading history, beta feedback, error logs, manga stats, listen sessions,
 * group calls) while leaving every account, relationship, and published work untouched. This is
 * NOT scripts/wipe-beta-data.js (that one deletes every non-admin Firebase Auth account and
 * Firestore profile outright — a full pre-launch reset, not a selective one).
 *
 * DESTRUCTIVE AND IRREVERSIBLE for what it touches. Takes a local JSON backup of everything it's
 * about to delete/reset (scripts/selective-wipe-backup-<timestamp>.json) before making any writes,
 * as a safety net — this script does not restore from it automatically; that would need a manual
 * re-import if ever needed.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT in .env.local (same as the rest of this project's admin
 * tooling), read directly rather than via a serviceAccountKey.json file.
 *
 * Usage: node scripts/selective-wipe.js
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const FLAT_COLLECTIONS = {
  creatorFeed: "Cleared feed posts",
  stories: "Cleared stories",
  betaFeedback: "Cleared beta feedback",
  errors: "Cleared error logs",
  mangaStats: "Cleared manga stats",
  listenSessions: "Cleared listen sessions",
};

function initAdminApp() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const envText = fs.readFileSync(envPath, "utf8");
  const match = envText.match(/^FIREBASE_SERVICE_ACCOUNT=(.*)$/m);
  if (!match) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT not found in .env.local");
    process.exit(1);
  }
  const serviceAccount = JSON.parse(match[1]);
  return initializeApp({ credential: cert(serviceAccount) });
}

/** Deletes every doc in a flat collection, batched to stay under Firestore's
 * 500-writes-per-batch limit. */
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

async function backup(db, usersSnap) {
  const backupPath = path.join(__dirname, `selective-wipe-backup-${Date.now()}.json`);
  const data = { collections: {}, users: {} };

  for (const name of Object.keys(FLAT_COLLECTIONS)) {
    const snap = await db.collection(name).get();
    data.collections[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const groupCallsSnap = await db.collection("groupCalls").get();
  data.collections.groupCalls = groupCallsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  for (const userDoc of usersSnap.docs) {
    const historySnap = await userDoc.ref.collection("history").get();
    const transactionsSnap = await userDoc.ref.collection("transactions").get();
    data.users[userDoc.id] = {
      coins: userDoc.data().coins ?? 0,
      history: historySnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      transactions: transactionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  }

  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
  return backupPath;
}

async function main() {
  const app = initAdminApp();
  const db = getFirestore(app);

  console.log("🧹 Starting selective beta wipe...\n");

  const usersSnap = await db.collection("users").get();

  console.log("📦 Taking a backup before making any changes...");
  const backupPath = await backup(db, usersSnap);
  console.log(`   Backup saved to ${backupPath}\n`);

  // ---- Flat collections ----
  for (const [name, label] of Object.entries(FLAT_COLLECTIONS)) {
    const count = await deleteAllDocs(db.collection(name));
    console.log(`✅ ${label} (${count} docs)`);
  }

  // ---- groupCalls — recursiveDelete so any pre-LiveKit-migration `signals` subcollections
  // (see lib/livekitGroupCall.ts's own commit history) get swept too, not just the parent docs.
  const groupCallsSnap = await db.collection("groupCalls").get();
  for (const doc of groupCallsSnap.docs) {
    await db.recursiveDelete(doc.ref);
  }
  console.log(`✅ Cleared group calls (${groupCallsSnap.size} docs)`);

  // ---- Per-user: reset coins, clear transaction + reading history ----
  for (const userDoc of usersSnap.docs) {
    await userDoc.ref.update({ coins: 0, coinHistory: FieldValue.delete() });
    await deleteAllDocs(userDoc.ref.collection("transactions"));
    await deleteAllDocs(userDoc.ref.collection("history"));
  }
  console.log(`✅ Reset coin balances (${usersSnap.size} users)`);
  console.log(`✅ Cleared reading histories (${usersSnap.size} users)`);

  console.log(
    "\n✨ Selective wipe complete. User accounts, works, DMs, and Platinum status preserved."
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Wipe failed:", error);
    process.exit(1);
  });
