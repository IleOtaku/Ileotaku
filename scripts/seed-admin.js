/**
 * Seeds the ÍléOtaku admin account: creates (or updates) the Firebase Auth user and
 * writes/merges the matching Firestore profile with full admin + Platinum privileges.
 *
 * Usage:
 *   1. In the Firebase Console, go to Project Settings → Service Accounts →
 *      "Generate new private key" and save the downloaded file as `serviceAccountKey.json`
 *      in the project root (it's already covered by .gitignore — never commit it).
 *   2. Run: node scripts/seed-admin.js
 *
 * Requires serviceAccountKey.json — see the error message below if it's missing.
 */

const fs = require("fs");
const path = require("path");
// firebase-admin@14 only exports app lifecycle + credential helpers from the package root
// (initializeApp, cert, applicationDefault, ...) — admin.credential/admin.auth()/
// admin.firestore() from the older "namespace" API no longer exist there, so auth and
// firestore have to come from their own subpath modules.
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const ADMIN_EMAIL = "admin@ileotaku.com";
const ADMIN_PASSWORD = "IleOtaku@Admin2025!";
const ADMIN_DISPLAY_NAME = "ÍléOtaku Admin";

function initAdminApp() {
  // scripts/seed-admin.js -> ".." -> project root, where serviceAccountKey.json lives.
  const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");

  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`
❌ serviceAccountKey.json not found at:
   ${serviceAccountPath}

This script authenticates as an admin using a Firebase service account key, not your
personal Google login — you need to download one first:

  1. Open the Firebase Console: https://console.firebase.google.com
  2. Select this project, then go to Project Settings → Service Accounts.
  3. Click "Generate new private key" and confirm the download.
  4. Save the downloaded file as "serviceAccountKey.json" in the project root
     (the same folder as package.json — NOT inside scripts/).

It's already covered by .gitignore, so it's safe to keep locally — never commit it or
share it, since it grants full admin access to your Firebase project.
`);
    process.exit(1);
  }

  // eslint-disable-next-line import/no-dynamic-require, global-require
  const serviceAccount = require(serviceAccountPath);
  return initializeApp({
    credential: cert(serviceAccount),
  });
}

async function seedAdmin() {
  const app = initAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
    console.log(`ℹ️  Admin auth user already exists (${userRecord.uid}) — updating password + profile.`);
    await auth.updateUser(userRecord.uid, {
      password: ADMIN_PASSWORD,
      displayName: ADMIN_DISPLAY_NAME,
      emailVerified: true,
    });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    userRecord = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_DISPLAY_NAME,
      emailVerified: true,
    });
    console.log(`✅ Created admin auth user (${userRecord.uid}).`);
  }

  const now = new Date();
  const platinumUntil = new Date(now);
  platinumUntil.setFullYear(platinumUntil.getFullYear() + 100);

  await db
    .collection("users")
    .doc(userRecord.uid)
    .set(
      {
        uid: userRecord.uid,
        displayName: ADMIN_DISPLAY_NAME,
        email: ADMIN_EMAIL,
        photoURL: "",
        bio: "",
        handle: "ileotaku-admin",
        role: "admin",
        tier: "platinum",
        isAdmin: true,
        isCreator: true,
        isPlatinum: true,
        platinumUntil: platinumUntil.toISOString(),
        coins: 99999,
        favorites: [],
        following: [],
        followers: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

  console.log("\n✅ Admin account is ready.\n");
  console.log("──────────────────────────────────────────");
  console.log("  ÍléOtaku Admin Credentials");
  console.log("──────────────────────────────────────────");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  UID:      ${userRecord.uid}`);
  console.log("──────────────────────────────────────────");
  console.log("  Sign in at /auth/login with these credentials.");
  console.log("  Change the password after first login in production.\n");
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Failed to seed admin account:\n", error);
    process.exit(1);
  });
