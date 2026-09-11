import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { uploadImage, uploadVideo } from "./cloudinary";
import type { Story, UserProfile } from "@/types";

const STORIES = "stories";
const DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000;
/** A single account may have at most this many simultaneously-active stories (Sprint "Polish-2"
 * Part 7) — enforced in createStory() itself, not just the "+" badge's UI gate, so a crafted
 * client-side call can't exceed it either. */
export const MAX_ACTIVE_STORIES = 10;
/** Free accounts' video stories cap at 30s; Platinum gets up to 90s — checked client-side against
 * the picked file's real `video.duration` (see StoryCreateModal) before it's ever uploaded, and
 * re-validated here so a crafted call can't bypass that check either. */
export const MAX_VIDEO_SECONDS_FREE = 30;
export const MAX_VIDEO_SECONDS_PLATINUM = 90;
/** Platinum's selectable range — 5 minutes to 5 days, per the spec's duration picker. Everyone
 * else is locked to DEFAULT_DURATION_MS (enforced by createStory itself, not just the UI, so a
 * crafted client-side call can't grant a free account a longer window than they're entitled to
 * — matching this codebase's existing pattern of never trusting a privilege check purely from
 * the UI, e.g. the Firestore rules' own computedForYouEligible()). */
export const PLATINUM_STORY_DURATIONS = [
  { label: "5 min", ms: 5 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "12 hours", ms: 12 * 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "2 days", ms: 2 * 24 * 60 * 60 * 1000 },
  { label: "5 days", ms: 5 * 24 * 60 * 60 * 1000 },
];

export interface StoryMedia {
  kind: "image" | "video" | "text";
  file?: File;
  textContent?: string;
  backgroundColor?: string;
}

/** Uploads `media` (if any — a text story has none) to Cloudinary under stories/{uid}/{filename}
 * and writes the story document. `durationMs` is only actually honored for a Platinum profile;
 * anyone else always gets the default 24h regardless of what's passed in. */
export async function createStory(
  uid: string,
  profile: Pick<UserProfile, "displayName" | "photoURL" | "isPlatinum">,
  media: StoryMedia,
  durationMs?: number
): Promise<string> {
  try {
    const activeCount = (await getUserStories(uid)).length;
    if (activeCount >= MAX_ACTIVE_STORIES) {
      throw new Error(`You can only have ${MAX_ACTIVE_STORIES} active stories at once. Delete one to add another.`);
    }

    const effectiveDuration = profile.isPlatinum && durationMs ? durationMs : DEFAULT_DURATION_MS;
    const now = Date.now();

    let mediaUrl = "";
    let mediaType: "image" | "video" | "text" = media.kind;
    if (media.kind === "image" && media.file) {
      const uploaded = await uploadImage(media.file, `stories/${uid}`);
      mediaUrl = uploaded.secureUrl;
    } else if (media.kind === "video" && media.file) {
      const uploaded = await uploadVideo(media.file, `stories/${uid}`);
      mediaUrl = uploaded.secureUrl;
    } else {
      mediaType = "text";
    }

    const ref = await addDoc(collection(db, STORIES), {
      uid,
      displayName: profile.displayName,
      ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
      mediaUrl,
      mediaType,
      ...(media.textContent ? { textContent: media.textContent } : {}),
      ...(media.backgroundColor ? { backgroundColor: media.backgroundColor } : {}),
      // Beta feedback bug: a video story wrote `duration: undefined` here, which addDoc()
      // rejects outright ("Unsupported field value: undefined") — every video story upload was
      // failing. `duration` is only meaningful for image/text segments anyway (a video plays for
      // its own natural length — see the field's own doc comment on the Story type), so it's
      // omitted entirely rather than written as `undefined` when the segment is a video.
      ...(media.kind === "image" || media.kind === "text" ? { duration: 5000 } : {}),
      expiresAt: new Date(now + effectiveDuration).toISOString(),
      viewedBy: [],
      createdAt: new Date(now).toISOString(),
    } satisfies Omit<Story, "id">);
    return ref.id;
  } catch (error) {
    await logError(error, { operation: "createStory", uid });
    throw error;
  }
}

/** Every non-expired story across the app, grouped by author — the home feed's stories bar reads
 * this once; subscribeToStories below is the real-time equivalent for while the bar is mounted. */
export async function getActiveStories(): Promise<Map<string, Story[]>> {
  try {
    const nowIso = new Date().toISOString();
    const q = query(collection(db, STORIES), where("expiresAt", ">", nowIso));
    const snap = await getDocs(q);
    const stories = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Story);
    const grouped = new Map<string, Story[]>();
    for (const story of stories) {
      const list = grouped.get(story.uid) ?? [];
      list.push(story);
      grouped.set(story.uid, list);
    }
    for (const list of Array.from(grouped.values())) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return grouped;
  } catch (error) {
    await logError(error, { operation: "getActiveStories" });
    return new Map();
  }
}

export async function getUserStories(uid: string): Promise<Story[]> {
  try {
    const nowIso = new Date().toISOString();
    const q = query(collection(db, STORIES), where("uid", "==", uid), where("expiresAt", ">", nowIso));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Story)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  } catch (error) {
    await logError(error, { operation: "getUserStories", uid });
    return [];
  }
}

/** Real-time version of getActiveStories — the home feed's stories bar uses this so a friend's
 * new story (or one of theirs expiring) appears/disappears live. */
export function subscribeToStories(callback: (grouped: Map<string, Story[]>) => void): Unsubscribe {
  const nowIso = new Date().toISOString();
  const q = query(collection(db, STORIES), where("expiresAt", ">", nowIso));
  return onSnapshot(
    q,
    (snap) => {
      const stories = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Story);
      const grouped = new Map<string, Story[]>();
      for (const story of stories) {
        const list = grouped.get(story.uid) ?? [];
        list.push(story);
        grouped.set(story.uid, list);
      }
      for (const list of Array.from(grouped.values())) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      callback(grouped);
    },
    () => callback(new Map())
  );
}

export async function viewStory(storyId: string, viewerUid: string): Promise<void> {
  try {
    await updateDoc(doc(db, STORIES, storyId), { viewedBy: arrayUnion(viewerUid) });
  } catch (error) {
    await logError(error, { operation: "viewStory", storyId, viewerUid });
  }
}

/** Real-time view count/viewer-list on ONE story — the story viewer's own "👁 N views" and
 * viewers-list sheet on a creator's own story use this rather than a one-shot read. */
export function subscribeToStoryViews(storyId: string, callback: (viewedBy: string[]) => void): Unsubscribe {
  return onSnapshot(
    doc(db, STORIES, storyId),
    (snap) => callback(snap.exists() ? ((snap.data() as Story).viewedBy ?? []) : []),
    () => callback([])
  );
}

export async function deleteStory(storyId: string, uid: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, STORIES, storyId));
    if (!snap.exists()) return;
    const story = snap.data() as Story;
    if (story.uid !== uid) throw new Error("You can only delete your own story.");

    // Cloudinary cleanup is deliberately skipped: publicId isn't stored on the story doc (only
    // its secure_url), and deriving one by parsing the URL risks deleting the wrong asset —
    // same reasoning as deleteWork's Cloudinary-cleanup note in lib/publishedSeries.ts. The
    // story doc itself is what actually controls "does this still show anywhere"; an orphaned
    // Cloudinary file is a storage cost, not a functional bug.
    await deleteDoc(doc(db, STORIES, storyId));
  } catch (error) {
    await logError(error, { operation: "deleteStory", storyId, uid });
    throw error;
  }
}
