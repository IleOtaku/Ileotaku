/**
 * One-time migration for beta feedback item "manga search results show a white 'General' badge
 * instead of the creator's real tier" (STEP 5). approveWork() (lib/admin.ts) now denormalizes a
 * creator's real 5-tier badge onto `authorVerifiedType` at approval time going forward — this
 * backfills every EXISTING publishedSeries (and its matching creatorWorks doc, same id) from its
 * creator's current profile, since approval time has already passed for anything published
 * before that fix landed.
 *
 * Tier priority mirrors lib/verification.ts's getVerificationBadge exactly (duplicated here in
 * plain JS since that module is TypeScript/ESM and this script runs directly under Node's
 * CommonJS require, same convention as this project's other one-off scripts/*.js migrations).
 *
 * Usage: node scripts/backfill-verified-types.js
 */
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function computeVerifiedType(user) {
  if (!user) return null;
  if (user.isFounder) return "founder";
  if (user.isAdmin) return "admin";
  const effectiveType = user.verifiedType ?? (user.isPublisher ? "publisher" : undefined);
  if (user.isVerified && effectiveType === "publisher") return "publisher";
  if (user.isVerified && effectiveType === "creator") return "creator";
  if (user.isVerified) return "verified";
  return null;
}

async function main() {
  const usersSnap = await db.collection("users").get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));

  const seriesSnap = await db.collection("publishedSeries").get();
  const worksSnap = await db.collection("creatorWorks").get();
  const workIds = new Set(worksSnap.docs.map((d) => d.id));
  console.log(`Found ${seriesSnap.size} publishedSeries docs, ${usersSnap.size} users.`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let opsInBatch = 0;

  for (const seriesDoc of seriesSnap.docs) {
    const series = seriesDoc.data();
    const authorId = series.authorId;
    const author = authorId ? users.get(authorId) : undefined;
    const verifiedType = computeVerifiedType(author);
    const authorVerified = !!(author && (author.isVerified === true || author.verified === true));

    if (series.authorVerifiedType === verifiedType && series.authorVerified === authorVerified) {
      skipped++;
      continue;
    }

    batch.update(seriesDoc.ref, { authorVerifiedType: verifiedType, authorVerified });
    opsInBatch++;
    // creatorWorks shares the exact same doc id as its published counterpart (see approveWork's
    // own batch.set(doc(db, "publishedSeries", workId), ...) using workId for both) — but only
    // update it if it still actually exists, since Firestore's update() throws on a missing doc
    // and a batch is all-or-nothing.
    if (workIds.has(seriesDoc.id)) {
      batch.update(db.collection("creatorWorks").doc(seriesDoc.id), {
        authorVerifiedType: verifiedType,
        authorVerified,
      });
      opsInBatch++;
    }
    updated++;

    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  console.log(`Updated ${updated} series (+ matching creatorWorks docs), skipped ${skipped} already correct.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
