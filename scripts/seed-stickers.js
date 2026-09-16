/**
 * Seeds the two official free starter sticker packs into Firestore's `stickerPacks` collection
 * (+ each pack's own `stickers` subcollection), for the DM Sticker Picker / Sticker Store.
 *
 * Image URLs: this project has no illustrated sticker-asset pipeline of its own to draw a real
 * pack from (same situation lib/sounds.ts's seed script already disclosed for audio) — each
 * sticker points at a placehold.co placeholder image (a real, freely-usable placeholder-image
 * service, not a broken/fake path) labeled with its own emoji/keyword, so the picker/store are
 * genuinely browsable and every sticker actually renders, rather than a cosmetic 404. Swap these
 * for real illustrated PNGs (uploaded to Cloudinary) before production.
 *
 * Usage: node scripts/seed-stickers.js (requires serviceAccountKey.json in the project root).
 */
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

function placeholderUrl(bg, label) {
  return `https://placehold.co/240x240/${bg}/FFFFFF.png?text=${encodeURIComponent(label)}&font=roboto`;
}

const PACKS = [
  {
    id: "ileotaku-originals",
    name: "ÍléOtaku Originals",
    description: "Manga-inspired reactions for every plot twist.",
    artist: "ÍléOtaku Team",
    stickers: [
      { label: "😱 PLOT TWIST", keywords: ["shock", "twist", "surprise", "gasp"], bg: "c4622d" },
      { label: "🔥 HYPE", keywords: ["hype", "fire", "excited"], bg: "d4a843" },
      { label: "😭 NOOO", keywords: ["cry", "sad", "no", "noo"], bg: "3d6b4f" },
      { label: "👀 SUS", keywords: ["suspicious", "side eye", "sus"], bg: "9ecfef" },
      { label: "💪 POWER UP", keywords: ["power", "strong", "level up"], bg: "a855f7" },
      { label: "🥷 STEALTH", keywords: ["ninja", "sneaky", "quiet"], bg: "1a1510" },
      { label: "⚔️ BATTLE", keywords: ["fight", "battle", "duel"], bg: "e07840" },
      { label: "📖 NEXT CHAPTER", keywords: ["reading", "chapter", "manga"], bg: "121009" },
      { label: "😴 CLIFFHANGER", keywords: ["tired", "waiting", "cliffhanger"], bg: "6d28d9" },
      { label: "🎉 SEASON FINALE", keywords: ["celebrate", "finale", "party"], bg: "3b82f6" },
      { label: "🤝 ALLIANCE", keywords: ["team up", "friends", "alliance"], bg: "4e8a64" },
      { label: "👑 ARC VILLAIN", keywords: ["villain", "boss", "king"], bg: "c8e8f8" },
    ],
  },
  {
    id: "african-expressions",
    name: "African Expressions",
    description: "Emotions and reactions with African flair.",
    artist: "ÍléOtaku Team",
    stickers: [
      { label: "🙌 NAWA", keywords: ["nawa", "wow", "reaction"], bg: "e07840" },
      { label: "😂 LMAOO", keywords: ["laugh", "funny", "lol"], bg: "d4a843" },
      { label: "🥘 CHOP TIME", keywords: ["food", "eating", "hungry"], bg: "c4622d" },
      { label: "💃 OWAMBE", keywords: ["party", "dance", "owambe"], bg: "a855f7" },
      { label: "🗣️ NO WAHALA", keywords: ["chill", "no problem", "relax"], bg: "3d6b4f" },
      { label: "🙏 THANK YOU O", keywords: ["thanks", "grateful", "blessed"], bg: "9ecfef" },
      { label: "😤 ABEG", keywords: ["annoyed", "abeg", "please"], bg: "1a1510" },
      { label: "🎊 CONGRATS", keywords: ["celebrate", "congrats", "win"], bg: "3b82f6" },
      { label: "☀️ GOOD MORNING", keywords: ["morning", "sunrise", "hello"], bg: "e07840" },
      { label: "🌙 GOODNIGHT", keywords: ["night", "sleep", "goodnight"], bg: "121009" },
      { label: "💯 FACTS", keywords: ["facts", "agree", "true"], bg: "6d28d9" },
      { label: "🎶 VIBES", keywords: ["music", "vibe", "dance"], bg: "4e8a64" },
    ],
  },
];

async function main() {
  for (const pack of PACKS) {
    const packRef = db.collection("stickerPacks").doc(pack.id);
    const existing = await packRef.get();
    if (existing.exists) {
      console.log(`Skipping "${pack.name}" — already seeded.`);
      continue;
    }

    const stickerUrls = pack.stickers.map((s) => placeholderUrl(s.bg, s.label));
    await packRef.set({
      name: pack.name,
      description: pack.description,
      artist: pack.artist,
      coverStickerUrl: stickerUrls[0],
      previewUrls: stickerUrls.slice(0, 3),
      stickerCount: pack.stickers.length,
      price: 0,
      isOfficial: true,
      downloads: 0,
      createdAt: new Date().toISOString(),
    });

    const batch = db.batch();
    pack.stickers.forEach((s, i) => {
      const ref = packRef.collection("stickers").doc();
      batch.set(ref, { url: placeholderUrl(s.bg, s.label), keywords: s.keywords, order: i });
    });
    await batch.commit();

    console.log(`Seeded "${pack.name}" with ${pack.stickers.length} stickers.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
