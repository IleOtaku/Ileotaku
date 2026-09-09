/**
 * TEMPORARY dev utility (Sprint 8 verification only — safe to delete): sets or clears the
 * `adminType` field on the seeded admin account, so the role-based dashboards
 * (Sub-Admin/Accountant/Technical) can be verified live using the one available admin login,
 * without touching `isAdmin` (which would lock the session out of /admin entirely).
 * Usage: node scripts/set-admin-type.js <sub|accountant|technical|clear>
 */
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const ADMIN_EMAIL = "admin@ileotaku.com";
const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const mode = process.argv[2];
  if (!["sub", "accountant", "technical", "clear"].includes(mode)) {
    console.error("Usage: node set-admin-type.js <sub|accountant|technical|clear>");
    process.exit(1);
  }

  const userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
  const ref = db.collection("users").doc(userRecord.uid);

  if (mode === "clear") {
    await ref.update({ adminType: FieldValue.delete() });
    console.log(`Cleared adminType on ${ADMIN_EMAIL} (${userRecord.uid}) — back to super admin.`);
  } else {
    await ref.update({ adminType: mode });
    console.log(`Set adminType="${mode}" on ${ADMIN_EMAIL} (${userRecord.uid}).`);
  }

  const snap = await ref.get();
  console.log("isAdmin:", snap.data().isAdmin, "adminType:", snap.data().adminType ?? "(none)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
