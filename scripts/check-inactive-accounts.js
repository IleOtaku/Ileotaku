/**
 * Sprint 9d — inactivity auto-deletion sweep. Intended to run on a schedule (weekly is plenty;
 * see SETUP.md) — manually for now, as a real Cloud Function scheduled job in Sprint 11.
 *
 * For every user:
 *   - Skips accounts with inactivityDeleteAfter === "never".
 *   - If they're within 14 days of their inactivity threshold and haven't been warned yet,
 *     sends the warning email and stamps deletionWarningEmailSent + scheduledDeletionAt.
 *   - If their scheduledDeletionAt has passed (and they were warned), deletes the account
 *     entirely: every users/{uid} subcollection, their creatorFeed posts, the main profile
 *     document, and the Firebase Auth user — then logs the deletion to `deletedAccounts` for
 *     audit.
 *
 * Usage:
 *   node scripts/check-inactive-accounts.js            # live run
 *   node scripts/check-inactive-accounts.js --dry-run   # prints what it WOULD do, changes nothing
 *
 * Requires serviceAccountKey.json in the project root — see scripts/seed-admin.js's own header
 * for how to generate one. Also reads RESEND_API_KEY (or SENDGRID_API_KEY) from the environment
 * to actually send the warning email; without either set, the email step logs what it would
 * have sent instead of failing the whole run (this project's .env.local doesn't ship real
 * credentials for either provider — see SETUP.md).
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DRY_RUN = process.argv.includes("--dry-run");

const DAY_MS = 86_400_000;
const WARNING_WINDOW_DAYS = 14;

const USER_SUBCOLLECTIONS = [
  "history",
  "transactions",
  "unlocked",
  "notifications",
  "drafts",
  "spotifyAuth",
  "nowPlaying",
];

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

/** Sends the "your account will be deleted" warning via Resend or SendGrid, whichever has an
 * API key configured. Logs and no-ops (rather than throwing) with neither set, or in --dry-run —
 * a missing email provider shouldn't stop the sweep from still tracking who's due a warning. */
async function sendWarningEmail(user) {
  const subject = "Your ÍléOtaku account will be deleted in 2 weeks due to inactivity";
  const body =
    "Your ÍléOtaku account will be deleted in 2 weeks due to inactivity. Log in to keep your account.";

  if (DRY_RUN) {
    console.log(`  [dry run] Would email ${user.email}: "${subject}"`);
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  try {
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "ÍléOtaku <noreply@ileotaku.com>",
          to: user.email,
          subject,
          text: body,
        }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    } else if (sendgridKey) {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: user.email }] }],
          from: { email: "noreply@ileotaku.com", name: "ÍléOtaku" },
          subject,
          content: [{ type: "text/plain", value: body }],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid responded ${res.status}`);
    } else {
      console.log(`  ⚠️  No RESEND_API_KEY or SENDGRID_API_KEY set — would have emailed ${user.email}.`);
    }
  } catch (error) {
    console.error(`  ⚠️  Failed to send warning email to ${user.email}:`, error.message);
  }
}

/** Deletes every doc in a collection, batched to stay under Firestore's 500-writes-per-batch
 * limit — same shape as lib/auth.ts's client-side deleteAllDocs, just against the Admin SDK. */
async function deleteAllDocs(db, colRef) {
  for (;;) {
    const snap = await colRef.limit(450).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 450) return;
  }
}

async function deleteAccount(db, auth, uid, email) {
  if (DRY_RUN) {
    console.log(`  [dry run] Would delete account ${uid} (${email}) entirely.`);
    return;
  }

  for (const name of USER_SUBCOLLECTIONS) {
    await deleteAllDocs(db, db.collection("users").doc(uid).collection(name));
  }

  const postsSnap = await db.collection("creatorFeed").where("uid", "==", uid).get();
  if (!postsSnap.empty) {
    const batch = db.batch();
    postsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await db.collection("users").doc(uid).delete();

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    // Already-deleted Auth users (e.g. a re-run after a partial previous failure) shouldn't
    // block the audit log below from still being written.
    console.error(`  ⚠️  Auth deleteUser failed for ${uid}:`, error.message);
  }

  await db.collection("deletedAccounts").add({
    uid,
    email,
    deletedAt: FieldValue.serverTimestamp(),
    reason: "inactivity",
  });
}

function monthsToDays(months) {
  return months * 30;
}

async function main() {
  const app = initAdminApp();
  const db = getFirestore(app);
  const auth = getAuth(app);

  console.log(`Running inactivity sweep${DRY_RUN ? " (--dry-run — no writes will happen)" : ""}...\n`);

  const usersSnap = await db.collection("users").get();
  const now = Date.now();

  let checked = 0;
  let warned = 0;
  let deleted = 0;

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const uid = userDoc.id;
    checked += 1;

    const inactivityDeleteAfter = user.inactivityDeleteAfter ?? 6;
    if (inactivityDeleteAfter === "never") continue;

    // lastActiveAt may be a Firestore Timestamp (older writes) or an ISO string (this
    // codebase's usual convention) — normalize either into a real Date.
    const lastActiveRaw = user.lastActiveAt;
    const lastActive = lastActiveRaw?.toDate
      ? lastActiveRaw.toDate()
      : lastActiveRaw
        ? new Date(lastActiveRaw)
        : user.createdAt
          ? new Date(user.createdAt)
          : null;
    if (!lastActive || Number.isNaN(lastActive.getTime())) continue;

    const daysSinceLastActive = (now - lastActive.getTime()) / DAY_MS;
    const deleteThresholdDays = monthsToDays(inactivityDeleteAfter);
    const warningThresholdDays = deleteThresholdDays - WARNING_WINDOW_DAYS;

    const scheduledDeletionAt = user.scheduledDeletionAt?.toDate
      ? user.scheduledDeletionAt.toDate()
      : user.scheduledDeletionAt
        ? new Date(user.scheduledDeletionAt)
        : null;

    if (scheduledDeletionAt && user.deletionWarningEmailSent && scheduledDeletionAt.getTime() < now) {
      console.log(`🗑️  ${uid} (${user.email}) — past scheduled deletion, deleting now.`);
      await deleteAccount(db, auth, uid, user.email);
      deleted += 1;
      continue;
    }

    if (daysSinceLastActive >= warningThresholdDays && !user.deletionWarningEmailSent) {
      console.log(
        `✉️  ${uid} (${user.email}) — ${Math.floor(daysSinceLastActive)} days inactive, ` +
          `threshold ${deleteThresholdDays}d — sending warning.`
      );
      await sendWarningEmail(user);
      warned += 1;

      if (!DRY_RUN) {
        const scheduledFor = new Date(now + WARNING_WINDOW_DAYS * DAY_MS);
        await db.collection("users").doc(uid).update({
          deletionWarningEmailSent: true,
          scheduledDeletionAt: scheduledFor.toISOString(),
        });
      }
    }
  }

  console.log(`\nChecked ${checked} accounts. Warned ${warned}. Deleted ${deleted}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Inactivity sweep failed:\n", error);
    process.exit(1);
  });
