import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import type { Sound } from "@/types";

const SOUNDS = "sounds";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a"];

function toSound(id: string, data: Record<string, unknown>): Sound {
  return { id, ...data } as Sound;
}

/** Cloudinary can serve just the audio track of an already-uploaded video by swapping in the
 * `f_mp3` transformation flag right after `/video/upload/` and forcing the extension to `.mp3` —
 * no separate upload or transcoding step needed. Shared between saveSoundFromVideo (below) and
 * createPost's own use of it (lib/creatorFeed.ts), so both always derive the exact same URL for a
 * given video. */
export function audioUrlFromVideo(videoUrl: string): string {
  return videoUrl.replace("/video/upload/", "/video/upload/f_mp3/").replace(/\.(mp4|webm|mov)(\?.*)?$/i, ".mp3$2");
}

/** Beta feedback: "Clean up the sound library and build creator-driven sound uploads." All public
 * sounds — both video-derived and directly-uploaded — most-used first. The library has no curated
 * catalog anymore; it's entirely creator-driven, so this (and getVideoSounds/getTrendingSounds
 * below) is genuinely empty until creators start posting/uploading. */
export async function getSoundLibrary(): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), where("isPublic", "==", true), orderBy("usageCount", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getSoundLibrary" });
    return [];
  }
}

/** SoundPicker's "From Videos" tab — sounds extracted from creators' own video posts. */
export async function getVideoSounds(): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), where("source", "==", "video_upload"), orderBy("usageCount", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getVideoSounds" });
    return [];
  }
}

/** SoundPicker's "My Sounds" tab — every sound this account owns, whether a direct upload or one
 * extracted from their own video post, newest first. */
export async function getCreatorSounds(uid: string): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), where("uploadedBy", "==", uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data())).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (error) {
    await logError(error, { operation: "sounds.getCreatorSounds", uid });
    return [];
  }
}

/** Reads an audio file's duration client-side by loading it into a throwaway <audio> element —
 * there's no server here to probe the file, so this is the only way to get a real duration
 * before upload without a transcoding pipeline. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener("loadedmetadata", () => {
      cleanup();
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    });
    audio.addEventListener("error", () => {
      cleanup();
      resolve(null);
    });
    audio.src = url;
  });
}

/** A creator uploading an audio file straight into the shared library, from SoundPicker's "My
 * Sounds" tab. */
export async function uploadSoundToLibrary(
  uid: string,
  file: File,
  title: string,
  uploaderName: string,
  uploaderHandle: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only MP3, WAV, OGG, or M4A files are supported.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Audio files must be under 10MB.");
  }

  // Cloudinary's raw-upload endpoint has no incremental byte-progress API of its own from a plain
  // fetch, so this simulated ramp (eases toward 90% while the request is in flight, then jumps to
  // 100% on completion) is the same approach lib/creatorFeed.ts's uploadPostVideo uses for images.
  let simulatedProgress = 0;
  const progressTimer = onProgress
    ? setInterval(() => {
        simulatedProgress = Math.min(90, simulatedProgress + 10);
        onProgress(simulatedProgress);
      }, 150)
    : null;

  try {
    const [duration, { secureUrl, publicId }] = await Promise.all([probeDuration(file), uploadAudio(file, `sounds/${uid}`)]);
    onProgress?.(100);

    const finalTitle = (title.trim() || file.name.replace(/\.[^/.]+$/, "")).slice(0, 80);
    const docRef = await addDoc(collection(db, SOUNDS), {
      title: finalTitle,
      titleLower: finalTitle.toLowerCase(),
      uploadedBy: uid,
      uploaderName,
      uploaderHandle,
      url: secureUrl,
      publicId,
      source: "direct_upload",
      duration,
      usageCount: 0,
      isPublic: true,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    await logError(error, { operation: "sounds.uploadSoundToLibrary", uid });
    throw error;
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
}

/** Beta feedback: "Auto-save audio from creator video uploads" — called by createPost
 * (lib/creatorFeed.ts) right after a video post is published, so the post's own audio becomes a
 * reusable Sound other creators can find in SoundPicker's "From Videos" tab. `usageCount` starts
 * at 1 since the video itself already counts as one use. */
export async function saveSoundFromVideo(
  videoUrl: string,
  videoPublicId: string,
  uploadedBy: string,
  uploaderName: string,
  uploaderHandle: string,
  postId: string
): Promise<string> {
  const title = `Sound by @${uploaderHandle}`;
  const docRef = await addDoc(collection(db, SOUNDS), {
    title,
    titleLower: title.toLowerCase(),
    uploadedBy,
    uploaderName,
    uploaderHandle,
    url: audioUrlFromVideo(videoUrl),
    originalVideoUrl: videoUrl,
    videoPublicId,
    source: "video_upload",
    postId,
    usageCount: 1,
    duration: null,
    isPublic: true,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
}

/** Deletes a creator's own sound from the library — both its Cloudinary file (direct uploads
 * only; a video_upload sound has no Cloudinary asset of its own, just a transformed URL onto the
 * post's own video) and the Firestore doc. Never touches the original post a video_upload sound
 * came from. */
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

/** The "title (editable)" control in SoundPicker's My Sounds tab — owner-only (enforced by
 * firestore.rules). */
export async function renameSound(soundId: string, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) return;
  await updateDoc(doc(db, SOUNDS, soundId), { title: trimmed, titleLower: trimmed.toLowerCase() });
}

/** Fire-and-forget usage counter, bumped once per post that attaches this sound — this is what
 * makes the library self-curate: popular sounds naturally rise to the top of getSoundLibrary's
 * own usageCount ordering purely from what creators actually pick. */
export async function incrementSoundUsage(soundId: string): Promise<void> {
  try {
    await updateDoc(doc(db, SOUNDS, soundId), { usageCount: increment(1) });
  } catch {
    // Non-fatal — usage counts are a discovery signal, not core functionality.
  }
}

/** Backfills a sound's duration the first time any viewer's own <audio> element reports it — see
 * probeDuration's own doc comment for why nothing probes it up front. Guarded (via
 * firestore.rules) to only ever apply while duration is still unset, so this can never overwrite
 * an already-known value. */
export async function setSoundDuration(soundId: string, duration: number): Promise<void> {
  try {
    await updateDoc(doc(db, SOUNDS, soundId), { duration });
  } catch {
    // Non-fatal — a missing duration just shows "--:--" a little longer.
  }
}

/** Client-side substring search across the whole public library, by title or @handle — the
 * library is small enough (every sound is creator-uploaded, not a mass-imported catalog) that
 * fetching and filtering in-memory is simpler and cheaper than standing up a search index. */
export async function searchSounds(searchQuery: string): Promise<Sound[]> {
  const needle = searchQuery.trim().toLowerCase();
  if (!needle) return getSoundLibrary();
  const all = await getSoundLibrary();
  return all.filter(
    (s) => s.titleLower.includes(needle) || s.uploaderHandle?.toLowerCase().includes(needle)
  );
}

/** Top N sounds by usage — powers the Explore page's "Trending Sounds" section and SoundPicker's
 * own trending row. */
export async function getTrendingSounds(count = 6): Promise<Sound[]> {
  try {
    const q = query(collection(db, SOUNDS), where("isPublic", "==", true), orderBy("usageCount", "desc"), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toSound(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "sounds.getTrendingSounds" });
    return [];
  }
}

/** Which feed post a "From Videos" sound was extracted from, for SoundPicker's "clicking a
 * video's sound shows which post it came from" — a plain get() rather than threading the whole
 * post through getVideoSounds, since this is only ever needed on demand (tapping one card), not
 * for every sound in the list. */
export async function getSoundOriginPost(sound: Pick<Sound, "postId">): Promise<{ id: string } | null> {
  if (!sound.postId) return null;
  try {
    const snap = await getDoc(doc(db, "creatorFeed", sound.postId));
    return snap.exists() ? { id: snap.id } : null;
  } catch {
    return null;
  }
}
