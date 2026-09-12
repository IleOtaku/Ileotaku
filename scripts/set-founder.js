/**
 * 5-tier verification overhaul (Part 2): sets isFounder:true on Zamyilton's account, the ONLY
 * account that should ever carry it — the gold Founder badge is a manual, one-off grant, never
 * something the ordinary verify/apply flow can produce.
 * Usage: node scripts/set-founder.js
 */
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Resolved relative to this file, not the current working directory the script happens to be
// run from — serviceAccountKey.json lives at the project root, one level up from scripts/.
const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function setFounder() {
  // Find Zamyilton by handle
  const snap = await db.collection("users").where("handleLower", "==", "zamyilton").get();

  if (snap.empty) {
    console.log("User not found");
    return;
  }

  const uid = snap.docs[0].id;
  await db.collection("users").doc(uid).update({ isFounder: true });
  console.log("✅ Zamyilton is now the Founder. UID:", uid);
}

setFounder().then(() => process.exit(0));
