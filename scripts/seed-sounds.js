/**
 * Seeds the shared sound library: 20 royalty-free-style placeholder tracks across 5 categories
 * into Firestore's `sounds` collection, for the Creator Feed's SoundPicker to browse.
 *
 * Audio URLs: real royalty-free MP3s were not available to fetch and upload to this project's
 * Firebase Storage in this environment, so each track's `url` points to a SoundHelix demo track
 * (https://www.soundhelix.com — long-standing, freely-usable sample MP3s made specifically for
 * exactly this kind of "need a real playable audio URL for testing" purpose) instead of an
 * actual Storage path. This is a deliberate substitution so sound preview/playback is genuinely
 * verifiable end-to-end right now, not a cosmetic placeholder that would 404 on play. Swap these
 * for real royalty-free tracks uploaded to Storage (sounds/library/{filename}) before production
 * — the track/artist names below are realistic royalty-free-catalog-style placeholders, not
 * actual Free Music Archive/Pixabay catalog entries.
 *
 * Usage: node scripts/seed-sounds.js (requires serviceAccountKey.json in the project root).
 */

const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

function soundHelixUrl(track) {
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${track}.mp3`;
}

const TRACKS = [
  // African Beats (8)
  { title: "Djembe Sunrise", artist: "Kevin MacLeod", duration: 187, category: "African Beats", track: 1 },
  { title: "Savanna Pulse", artist: "Scott Holmes", duration: 203, category: "African Beats", track: 2 },
  { title: "Kalimba Dreams", artist: "Ikson", duration: 165, category: "African Beats", track: 3 },
  { title: "Afrobeat Highlife", artist: "Jahzzar", duration: 219, category: "African Beats", track: 4 },
  { title: "Talking Drum Groove", artist: "Blue Dot Sessions", duration: 174, category: "African Beats", track: 5 },
  { title: "Marimba Sunset", artist: "Ketsa", duration: 196, category: "African Beats", track: 6 },
  { title: "Lagos Nights", artist: "Komiku", duration: 182, category: "African Beats", track: 7 },
  { title: "Sahara Wind", artist: "Chad Crouch", duration: 210, category: "African Beats", track: 8 },
  // Intense (3)
  { title: "Adrenaline Rush", artist: "Kevin MacLeod", duration: 158, category: "Intense", track: 9 },
  { title: "Dark Descent", artist: "Alexander Nakarada", duration: 201, category: "Intense", track: 10 },
  { title: "Battle Cry", artist: "HeatleyBros", duration: 176, category: "Intense", track: 11 },
  // Romantic (3)
  { title: "Velvet Moonlight", artist: "Ketsa", duration: 224, category: "Romantic", track: 12 },
  { title: "Sweet Serenade", artist: "Scott Holmes", duration: 193, category: "Romantic", track: 13 },
  { title: "First Kiss", artist: "Ikson", duration: 168, category: "Romantic", track: 14 },
  // Chill (3)
  { title: "Coffee Shop Vibes", artist: "Chad Crouch", duration: 205, category: "Chill", track: 15 },
  { title: "Lazy Sunday", artist: "Ketsa", duration: 189, category: "Chill", track: 16 },
  { title: "Ocean Breeze", artist: "Blue Dot Sessions", duration: 212, category: "Chill", track: 1 },
  // Epic (3)
  { title: "Rise of Empires", artist: "Alexander Nakarada", duration: 231, category: "Epic", track: 2 },
  { title: "Kingdom Anthem", artist: "HeatleyBros", duration: 198, category: "Epic", track: 3 },
  { title: "The Final Stand", artist: "Kevin MacLeod", duration: 217, category: "Epic", track: 4 },
];

async function main() {
  const batch = db.batch();
  const now = new Date().toISOString();

  TRACKS.forEach((t) => {
    const ref = db.collection("sounds").doc();
    batch.set(ref, {
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      url: soundHelixUrl(t.track),
      category: t.category,
      source: "library",
      usageCount: Math.floor(Math.random() * 400),
      createdAt: now,
    });
  });

  await batch.commit();
  console.log(`Seeded ${TRACKS.length} sounds into the "sounds" collection.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
