import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteFile, uploadAudio } from "./cloudinary";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import type { Sound, SoundCategory } from "@/types";

const SOUNDS = "sounds";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"];

/** Shared category → color-token mapping, used by both SoundPicker and the Explore page's
 * Trending Sounds cards so a category always reads the same color everywhere it appears. */
export const SOUND_CATEGORY_COLORS: Record<SoundCategory, string> = {
  "African Beats": "bg-clay/15 text-clay2",
  Intense: "bg-red-500/15 text-red-400",
  Romantic: "bg-pink-500/15 text-pink-400",
  Chill: "bg-green/15 text-green2",
  Epic: "bg-gold/15 text-gold2",
};

function toSound(id: string, data: Record<string, unknown>): Sound {
  return { id, ...data } as Sound;
}

/** Fetches the shared sound library, optionally filtered to one category. Newest first within
 * a category isn't meaningful here — the picker sorts by usage, so this returns unordered and
 * lets the caller sort as it needs (avoids requiring a composite index for every category). */
export async function getSoundLibrary(category?: SoundCategory): Promise<Sound[]> {
  try {
    const q = category
      ? query(collection(db, SOUNDS), where("source", "==", "library"), where("category", "==", category))
      : query(collection(db, SOUNDS), where("source", "==", "library"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getSoundLibrary", category });
    return [];
  }
}

/** Sounds a specific creator has uploaded themselves — the "My Sounds" tab. */
export async function getCreatorSounds(uid: string): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), where("source", "==", "creator"), where("uploadedBy", "==", uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getCreatorSounds", uid });
    return [];
  }
}

/** Reads an audio file's duration client-side by loading it into a throwaway <audio> element —
 * there's no server here to probe the file, so this is the only way to get a real duration
 * before upload without a transcoding pipeline. */
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener("loadedmetadata", () => {
      cleanup();
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    });
    audio.addEventListener("error", () => {
      cleanup();
      resolve(0);
    });
    audio.src = url;
  });
}

/** Uploads an audio file (MP3/WAV/OGG, ≤5MB) to Cloudinary under sounds/{uid}/ and writes its
 * metadata (plus Cloudinary's public_id, needed to delete it later — see deleteCreatorSound)
 * to Firestore. Cloudinary's raw-upload endpoint has no incremental byte-progress API of its
 * own from a plain fetch, so `onProgress` here is still a client-side simulated ramp (eases
 * toward 90% while the request is in flight, then jumps to 100% on completion) — unlike video
 * uploads, which get real XHR progress (see lib/creatorFeed.ts's uploadPostVideo). */
export async function uploadCreatorSound(
  uid: string,
  file: File,
  title: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only MP3, WAV, or OGG files are supported.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Audio files must be under 5MB.");
  }

  let simulatedProgress = 0;
  const progressTimer = onProgress
    ? setInterval(() => {
        simulatedProgress = Math.min(90, simulatedProgress + 10);
        onProgress(simulatedProgress);
      }, 150)
    : null;

  try {
    const [duration, { secureUrl, publicId }] = await Promise.all([
      probeDuration(file),
      uploadAudio(file, `sounds/${uid}`),
    ]);
    onProgress?.(100);

    const docRef = await addDoc(collection(db, SOUNDS), {
      title: title.trim().slice(0, 80) || file.name,
      artist: "You",
      duration,
      url: secureUrl,
      publicId,
      category: "Chill" satisfies SoundCategory,
      source: "creator",
      uploadedBy: uid,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    await logError(error, { operation: "sounds.uploadCreatorSound", uid });
    throw error;
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
}

/** Deletes a creator's own uploaded sound — both its Cloudinary file and Firestore doc. Only
 * ever called from the UI on the signed-in user's own sounds; Firestore rules enforce this too.
 * Sounds uploaded before publicId was tracked (pre-Cloudinary-migration) have nothing to delete
 * from Cloudinary — the Firestore doc removal still succeeds either way. */
export async function deleteCreatorSound(sound: Sound): Promise<void> {
  try {
    await deleteDoc(doc(db, SOUNDS, sound.id));
    if (sound.publicId) {
      try {
        await deleteFile(sound.publicId, "raw");
      } catch {
        // Non-fatal — an orphaned Cloudinary file isn't worth failing the whole delete over.
      }
    }
  } catch (error) {
    await logError(error, { operation: "sounds.deleteCreatorSound", soundId: sound.id });
    throw error;
  }
}

/** Fire-and-forget usage counter, bumped once per post that attaches this sound. */
export async function incrementSoundUsage(soundId: string): Promise<void> {
  try {
    await updateDoc(doc(db, SOUNDS, soundId), { usageCount: increment(1) });
  } catch {
    // Non-fatal — usage counts are a discovery signal, not core functionality.
  }
}

/** Client-side substring search across the whole library by title or artist — the library is
 * small (dozens of tracks, not thousands), so fetching and filtering in-memory is simpler and
 * cheaper than standing up a search index for it. */
export async function searchSounds(searchQuery: string): Promise<Sound[]> {
  const needle = searchQuery.trim().toLowerCase();
  if (!needle) return getSoundLibrary();
  const all = await getSoundLibrary();
  return all.filter(
    (s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle)
  );
}

/** Top N sounds by usage — powers the Explore page's "Trending Sounds" section. */
export async function getTrendingSounds(count = 6): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), orderBy("usageCount", "desc"), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getTrendingSounds" });
    return [];
  }
}
