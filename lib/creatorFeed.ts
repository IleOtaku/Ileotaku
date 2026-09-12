import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getVideoThumbnail, uploadVideo } from "./cloudinary";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateLastActive, updateUserPrefs } from "./firestore";
import { createNotification } from "./notifications";
import { incrementSoundUsage } from "./sounds";
import { NotificationType, type CreatorPost, type CreatorPostType, type EditingApp, type FeedComment, type Sound, type UserProfile } from "@/types";

const FEED = "creatorFeed";

/** Whether an author's role permits their posts to enter the algorithmic For You feed at all.
 * Only accounts that can post to the feed in the first place (Creator or Publisher — see
 * PostComposer's own `canPost` gate) are ever eligible; a banned or suspended account is
 * excluded even though it can't reach the composer today, as a defensive backstop against a
 * future entry point (e.g. a scheduled post) publishing on its behalf. Platinum status is
 * intentionally NOT a gate here — every eligible creator's posts compete in For You on equal
 * footing; `isPlatinum` only ever affects ranking indirectly, via the badges already denormalized
 * onto the post. */
export function getForYouEligibility(profile: Pick<UserProfile, "isCreator" | "isPublisher" | "isBanned">): boolean {
  return (profile.isCreator === true || profile.isPublisher === true) && profile.isBanned !== true;
}

/** Firestore's `in` operator caps at 30 comparison values — following lists longer than that
 * are truncated to the 30 most-recently-followed creators for the Following feed query. */
const MAX_IN_CLAUSE = 30;

export interface CreatorPostBadges {
  isVerified?: boolean;
  isPlatinum?: boolean;
  isFoundingCreator?: boolean;
  /** Denormalized alongside isVerified so components/ui/Badges.tsx's VerifiedBadge can pick the
   * right tier/color on a feed post too, same as everywhere else it renders. */
  isPublisher?: boolean;
  isFounder?: boolean;
  /** Beta feedback: creator-side "disable downloads" toggle, denormalized at post time so
   * FeedShareSheet can hide its Download button without a per-post profile lookup. */
  disableDownloads?: boolean;
}

export interface FeedPage {
  posts: CreatorPost[];
  /** Cursor for the next getPosts()/getFollowingFeed()/getForYouFeed() call, or null once the
   * feed is exhausted. */
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}

/** Defaults applied to every document read back out of Firestore, so posts written before this
 * sprint (which have none of these fields) still satisfy CreatorPost's now-required shape
 * instead of leaving `undefined` to leak into scoring math, boost-tier lookups, etc. */
const POST_DEFAULTS = {
  mediaType: "none" as const,
  isDraft: false,
  boostLevel: 0 as const,
  forYouScore: 0,
  viewCount: 0,
  watchTime: 0,
  forYouEligible: false,
};

function toPost(d: QueryDocumentSnapshot<DocumentData>): CreatorPost {
  const data = d.data();
  return {
    ...POST_DEFAULTS,
    // Older posts counted views via the `views` field only — fold it into viewCount so an
    // old post doesn't read as having zero views just because it predates this sprint.
    viewCount: (data.viewCount as number | undefined) ?? (data.views as number | undefined) ?? 0,
    // Sprint "Polish-2" Part 8 renamed `profileVisits` to `profileVisitsFromPost` — fold the old
    // key in the same way, so a post's already-accumulated count survives the rename.
    profileVisitsFromPost:
      (data.profileVisitsFromPost as number | undefined) ?? (data.profileVisits as number | undefined) ?? 0,
    id: d.id,
    ...data,
  } as CreatorPost;
}

/* ---------------------------- Boost economy ---------------------------- */

export interface BoostTierConfig {
  /** Coin cost to purchase this tier. */
  cost: number;
  /** How long the boost stays active once purchased. */
  hours: number;
  /** Multiplier applied to a post's base For You score while the boost is active. */
  multiplier: number;
  label: string;
}

export const BOOST_TIERS: Record<1 | 2 | 3, BoostTierConfig> = {
  1: { cost: 50, hours: 24, multiplier: 2, label: "Boost" },
  2: { cost: 150, hours: 48, multiplier: 5, label: "Super Boost" },
  3: { cost: 500, hours: 72, multiplier: 10, label: "Mega Boost" },
};

/* ---------------------------- Resolution-based monetization ---------------------------- */

/** Coin cost to post at each image resolution — "standard" is always free, higher tiers cost
 * coins UNLESS the poster is Platinum, in which case every tier is free (see
 * resolutionCost() below). This is the resolution half of Sprint 9b's monetization model: coins
 * pay per-post for a resolution bump, Platinum pays once for unlimited high-res posting. */
export const IMAGE_RESOLUTION_COSTS: Record<NonNullable<CreatorPost["imageResolution"]>, number> = {
  standard: 0,
  hd: 10,
  "2k": 25,
  "4k": 50,
};

export const VIDEO_RESOLUTION_COSTS: Record<NonNullable<CreatorPost["videoResolution"]>, number> = {
  "480p": 0,
  "720p": 15,
  "1080p": 30,
  "2k": 60,
  "4k": 120,
};

/** The coin cost a specific poster actually pays for a resolution — zero for Platinum members
 * (a perk) and for anyone choosing the free base tier, otherwise the flat cost above. */
export function resolutionCost(
  kind: "image" | "video",
  resolution: string | undefined,
  isPlatinum: boolean
): number {
  if (!resolution || isPlatinum) return 0;
  const table = kind === "image" ? IMAGE_RESOLUTION_COSTS : VIDEO_RESOLUTION_COSTS;
  return (table as Record<string, number>)[resolution] ?? 0;
}

export interface ResolutionChargeResult {
  success: boolean;
  message?: string;
}

/** Deducts the coin cost of a chosen resolution tier before a post/draft-publish goes out —
 * called by the composer immediately before createPost(). No-ops (and succeeds) when the cost is
 * zero, so callers can always call this unconditionally rather than branching on whether a
 * charge is actually needed. */
export async function chargeForResolution(
  uid: string,
  kind: "image" | "video",
  resolution: string | undefined,
  isPlatinum: boolean
): Promise<ResolutionChargeResult> {
  const cost = resolutionCost(kind, resolution, isPlatinum);
  if (cost <= 0) return { success: true };
  try {
    const profile = await getUserProfile(uid);
    if (!profile || (profile.coins ?? 0) < cost) {
      return { success: false, message: `Not enough coins — posting at ${resolution} costs ${cost} coins.` };
    }
    const newBalance = profile.coins - cost;
    await updateUserPrefs(uid, { coins: newBalance });
    await addDoc(collection(db, "users", uid, "transactions"), {
      userId: uid,
      type: "spend",
      amount: -cost,
      balanceAfter: newBalance,
      description: `Posted ${kind} at ${resolution}`,
      category: "resolution",
      createdAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    await logError(error, { operation: "creatorFeed.chargeForResolution", uid, kind, resolution });
    return { success: false, message: "Couldn't charge coins for this resolution. Please try again." };
  }
}

/* ---------------------------- For You scoring ---------------------------- */

type ScoreInput = Pick<
  CreatorPost,
  | "uid"
  | "likes"
  | "commentCount"
  | "viewCount"
  | "watchTime"
  | "createdAt"
  | "boostLevel"
  | "boostExpiresAt"
  | "replayCount"
  | "profileVisitsFromPost"
  | "shareCount"
  | "bookmarkCount"
  | "isVerified"
  | "isFoundingCreator"
  | "isPlatinum"
  | "mediaType"
>;

/** Per-viewer signals calculateForYouScore can't derive from the post document alone — see the
 * function's own doc comment for why these are a separate optional argument rather than fields on
 * the post itself. */
export interface ForYouUserContext {
  /** Does the viewer follow this post's author? */
  followsAuthor?: boolean;
  /** Has the viewer interacted with this post before? Approximated as "already liked it" — the
   * one prior-interaction signal already sitting on the post doc (`likes`) with no extra read;
   * there's no reverse index today from a viewer to every author they've ever engaged with, which
   * a true "interacted with this AUTHOR before" check would need across the author's other posts. */
  hasInteractedBefore?: boolean;
}

/**
 * Ranking score behind the For You feed (Sprint "Polish-2" Part 8). Four components:
 *  - engagementScore: raw activity on the post, likes/comments/shares/bookmarks/views/watch
 *    time/replays/profile-visits, each weighted by how strong a "this person actually cared"
 *    signal it is (a share counts for far more than a bare view).
 *  - qualityScore: flat bonuses for trust/production signals — a verified or founding-creator
 *    author, Platinum status, and richer media (video over images over text).
 *  - relationshipScore: THIS viewer's own relationship to the post — do they follow the author,
 *    have they engaged with it before. Optional and 0 by default (see ForYouUserContext) since
 *    every call site that WRITES a post's stored forYouScore (createPost, likePost,
 *    incrementViewCount, trackWatchTime, boostPost/expireBoosts) has no specific viewer in mind —
 *    Firestore's `orderBy("forYouScore", "desc")` needs one shared score per post. getForYouFeed()
 *    applies the real per-viewer relationship boost as a second pass on top of that shared score
 *    (see its own doc comment) rather than baking a single viewer's context into the stored value.
 *  - recencyBonus: a flat top-up for anything under 6 hours old, on top of the age-based decay
 *    below, so a brand-new post doesn't need to out-engage a slower-decaying older one just to
 *    surface at all in its first couple of hours.
 * The engagement+quality+relationship+recency sum is divided by an age-based "gravity" term — the
 * same shape as Hacker News's ranking formula — so a post needs proportionally more engagement to
 * stay near the top the older it gets. An active boost then multiplies the whole decayed score,
 * which is intentional: boosting only *pays off* on a post that's already earning some genuine
 * engagement, rather than guaranteeing top placement outright.
 */
export function calculateForYouScore(post: ScoreInput, userContext?: ForYouUserContext): number {
  const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000);

  const engagementScore =
    post.likes.length * 3 +
    post.commentCount * 8 +
    (post.shareCount ?? 0) * 12 +
    (post.bookmarkCount ?? 0) * 6 +
    post.viewCount * 0.5 +
    post.watchTime * 0.1 +
    (post.replayCount ?? 0) * 4 +
    (post.profileVisitsFromPost ?? 0) * 10;

  const qualityScore =
    (post.isVerified ? 15 : 0) +
    (post.isFoundingCreator ? 10 : 0) +
    (post.isPlatinum ? 5 : 0) +
    (post.mediaType === "video" ? 8 : 0) +
    (post.mediaType === "image" || post.mediaType === "images" ? 4 : 0);

  const relationshipScore = (userContext?.followsAuthor ? 25 : 0) + (userContext?.hasInteractedBefore ? 10 : 0);

  const recencyBonus = ageHours < 2 ? 50 : ageHours < 6 ? 20 : 0;

  const decay = Math.pow(ageHours + 2, 1.2);

  const boostActive =
    post.boostLevel > 0 && !!post.boostExpiresAt && new Date(post.boostExpiresAt).getTime() > Date.now();
  const boostMultiplier = boostActive ? BOOST_TIERS[post.boostLevel as 1 | 2 | 3].multiplier : 1;

  return Math.round(((engagementScore + qualityScore + relationshipScore + recencyBonus) / decay) * boostMultiplier);
}

/* ---------------------------- Video upload ---------------------------- */

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export interface UploadedVideo {
  url: string;
  posterUrl: string;
  /** Seconds. */
  duration: number;
}

/** Reads a video file's duration client-side by loading it into an off-DOM <video> — there's no
 * server here to probe it. Used to be paired with a canvas-captured poster frame too, but
 * Cloudinary auto-generates a poster for any uploaded video (see getVideoThumbnail() in
 * lib/cloudinary.ts), so that manual capture-and-separately-upload step is gone; one upload now
 * produces both the video and its poster. Mirrors lib/sounds.ts's probeDuration for the same
 * "no server-side media pipeline" reason. */
function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.addEventListener("loadedmetadata", () => {
      cleanup();
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 0);
    });
    video.addEventListener("error", () => {
      cleanup();
      resolve(0);
    });
    video.src = url;
  });
}

/** Uploads a video (MP4/WebM/MOV, ≤100MB) to Cloudinary under feed/videos/{uid}/ and returns its
 * secure_url, an auto-generated poster thumbnail url, and the probed duration. Real upload
 * progress (not a simulated ramp — Cloudinary's upload can take a while for a 100MB file, and
 * XMLHttpRequest's upload.onprogress reports actual bytes transferred) flows straight through
 * from lib/cloudinary.ts's uploadVideo(). */
export async function uploadPostVideo(
  uid: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadedVideo> {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    throw new Error("Only MP4, WebM, or MOV videos are supported.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Videos must be under 100MB.");
  }

  const [duration, { secureUrl }] = await Promise.all([
    probeVideoDuration(file),
    uploadVideo(file, `feed/videos/${uid}`, onProgress),
  ]);

  return { url: secureUrl, posterUrl: getVideoThumbnail(secureUrl), duration };
}

/* ---------------------------- Create / read ---------------------------- */

export interface CreatePostInput {
  uid: string;
  displayName: string;
  photoURL?: string;
  handle?: string;
  content: string;
  type: CreatorPostType;
  badges?: CreatorPostBadges;
  sound?: Sound | null;
  attachments?: string[];
  imageResolution?: CreatorPost["imageResolution"];
  videoUrl?: string;
  videoPosterUrl?: string;
  videoDuration?: number;
  videoResolution?: CreatorPost["videoResolution"];
  editingApp?: EditingApp | null;
  /** Whether the author's role permits this post to enter the algorithmic For You feed at all —
   * computed by the caller from the author's profile (see getForYouEligibility() below), since
   * createPost() itself has no reason to re-derive role logic from a bare uid. */
  forYouEligible: boolean;
}

/** Publishes a new feed post. Content is hard-capped at 500 chars here too, as a server-of-truth
 * backstop behind the composer's own client-side limit. Badges are denormalized onto the post at
 * write-time (from the author's current profile) so the feed never needs a per-post profile
 * lookup just to render a verified/founding/platinum badge. */
export async function createPost(input: CreatePostInput): Promise<string> {
  const {
    uid,
    displayName,
    photoURL,
    handle,
    content,
    type,
    badges = {},
    sound,
    attachments = [],
    imageResolution,
    videoUrl,
    videoPosterUrl,
    videoDuration,
    videoResolution,
    editingApp,
    forYouEligible,
  } = input;

  const mediaType: CreatorPost["mediaType"] = videoUrl
    ? "video"
    : attachments.length > 1
      ? "images"
      : attachments.length === 1
        ? "image"
        : "none";

  try {
    const ref = await addDoc(collection(db, FEED), {
      uid,
      displayName,
      ...(photoURL ? { photoURL } : {}),
      ...(handle ? { handle } : {}),
      content: content.trim().slice(0, 500),
      type,
      attachments: attachments.slice(0, 4),
      likes: [],
      commentCount: 0,
      isVerified: badges.isVerified ?? false,
      isPlatinum: badges.isPlatinum ?? false,
      isFoundingCreator: badges.isFoundingCreator ?? false,
      isPublisher: badges.isPublisher ?? false,
      isFounder: badges.isFounder ?? false,
      disableDownloads: badges.disableDownloads ?? false,
      ...(sound
        ? {
            soundId: sound.id,
            soundUrl: sound.url,
            soundTitle: sound.title,
            soundArtist: sound.artist,
            soundSource: sound.source,
            soundDuration: sound.duration,
            ...(sound.source !== "spotify" ? { soundCategory: sound.category } : {}),
          }
        : {}),
      mediaType,
      ...(imageResolution ? { imageResolution } : {}),
      ...(videoUrl
        ? {
            videoUrl,
            ...(videoPosterUrl ? { videoPosterUrl } : {}),
            ...(videoDuration !== undefined ? { videoDuration } : {}),
            ...(videoResolution ? { videoResolution } : {}),
          }
        : {}),
      ...(editingApp !== undefined ? { editingApp } : {}),
      isDraft: false,
      boostLevel: 0,
      boostExpiresAt: null,
      forYouScore: 0,
      viewCount: 0,
      watchTime: 0,
      forYouEligible,
      createdAt: new Date().toISOString(),
    });
    // Fire-and-forget — a missed usage-count bump shouldn't fail the post itself. Spotify
    // preview "sounds" aren't real `sounds` docs (their id is a synthetic `spotify:{trackId}`),
    // so this silently no-ops for them via incrementSoundUsage's own internal try/catch.
    if (sound) incrementSoundUsage(sound.id);
    await updateLastActive(uid);
    return ref.id;
  } catch (error) {
    await logError(error, { operation: "creatorFeed.createPost", uid });
    throw error;
  }
}

/** Paginated "For You" feed — every creator's posts, newest first. Pass the previous page's
 * `lastDoc` back in to fetch the next page. */
export async function getPosts(
  pageSize = 10,
  lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<FeedPage> {
  try {
    const q = lastDoc
      ? query(collection(db, FEED), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(pageSize))
      : query(collection(db, FEED), orderBy("createdAt", "desc"), limit(pageSize));
    const snap = await getDocs(q);
    return {
      posts: snap.docs.map(toPost),
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    };
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getPosts" });
    return { posts: [], lastDoc: null };
  }
}

/** Real per-viewer context getForYouFeed needs to apply calculateForYouScore's relationshipScore
 * — `followingIds` is the viewer's own `profile.following` array (already loaded by every screen
 * that calls this), `viewerUid` powers the hasInteractedBefore proxy (see ForYouUserContext's
 * doc comment). Both optional so a signed-out viewer still gets a (relationship-less) feed. */
export interface ForYouFeedContext {
  followingIds?: string[];
  viewerUid?: string;
}

/** Paginated, algorithmically-ranked "For You" feed — only posts whose author is
 * `forYouEligible`, drawn from the precomputed `forYouScore` order (kept fresh by createPost,
 * likePost, incrementViewCount, trackWatchTime, and boostPost/expireBoosts, rather than
 * recomputed on every read, since Firestore can't order by a computed expression). Requires a
 * composite index on (forYouEligible ASC, forYouScore DESC) — see firestore.indexes.json.
 *
 * `userContext` applies calculateForYouScore's relationshipScore (follows author / already liked
 * this post) as a second pass ONLY within the page Firestore already returned — pagination itself
 * still walks the shared, viewer-independent forYouScore order (a `lastDoc` cursor has to refer to
 * a document from that same underlying query, so this can't re-rank a wider candidate pool without
 * breaking `startAfter`). Two viewers loading the same page can therefore see it in a different
 * order when their relationship signals differ, without needing a per-viewer-and-post score
 * precomputed for every possible viewer ahead of time.
 */
export async function getForYouFeed(
  pageSize = 10,
  lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  userContext?: ForYouFeedContext
): Promise<FeedPage> {
  try {
    const base = query(
      collection(db, FEED),
      where("forYouEligible", "==", true),
      orderBy("forYouScore", "desc")
    );
    const q = lastDoc ? query(base, startAfter(lastDoc), limit(pageSize)) : query(base, limit(pageSize));
    const snap = await getDocs(q);
    const posts = snap.docs.map(toPost);
    const followingIds = userContext?.followingIds ?? [];
    const viewerUid = userContext?.viewerUid;

    const rescored = viewerUid
      ? [...posts].sort(
          (a, b) =>
            calculateForYouScore(b, {
              followsAuthor: followingIds.includes(b.uid),
              hasInteractedBefore: b.likes.includes(viewerUid),
            }) -
            calculateForYouScore(a, {
              followsAuthor: followingIds.includes(a.uid),
              hasInteractedBefore: a.likes.includes(viewerUid),
            })
        )
      : posts;

    return {
      posts: rescored,
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    };
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getForYouFeed" });
    return { posts: [], lastDoc: null };
  }
}

/** Paginated "Following" feed — posts from only the given creator uids. Returns an empty page
 * immediately (no query) when the list is empty, since a `where("uid","in",[])` call is invalid. */
export async function getFollowingFeed(
  followingIds: string[],
  pageSize = 10,
  lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<FeedPage> {
  if (followingIds.length === 0) return { posts: [], lastDoc: null };
  const ids = followingIds.slice(0, MAX_IN_CLAUSE);
  try {
    const q = lastDoc
      ? query(
          collection(db, FEED),
          where("uid", "in", ids),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(collection(db, FEED), where("uid", "in", ids), orderBy("createdAt", "desc"), limit(pageSize));
    const snap = await getDocs(q);
    return {
      posts: snap.docs.map(toPost),
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    };
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getFollowingFeed" });
    return { posts: [], lastDoc: null };
  }
}

/** Toggles `uid` in a post's `likes` array. Caller passes whether it's currently liked (the UI
 * already has this from the post it's rendering) rather than this function re-reading the doc.
 * Also recomputes and writes `forYouScore` in the same update, so a like's ranking effect is
 * visible immediately rather than waiting on some later recompute pass. */
export async function likePost(uid: string, postId: string, currentlyLiked: boolean): Promise<void> {
  try {
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? toPost(snap as QueryDocumentSnapshot<DocumentData>) : null;
    const nextLikes = currentlyLiked
      ? (current?.likes ?? []).filter((id) => id !== uid)
      : [...(current?.likes ?? []), uid];
    const forYouScore = current
      ? calculateForYouScore({ ...current, likes: nextLikes })
      : undefined;
    await updateDoc(ref, {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      ...(forYouScore !== undefined ? { forYouScore } : {}),
    });

    // Beta feedback: "Creators of a post should receive notifications as soon as a user likes...
    // their posts." Only on a fresh like (not an unlike), never for liking your own post, and
    // best-effort — a missed like notification shouldn't fail the like itself.
    if (!currentlyLiked && current && current.uid !== uid) {
      const liker = await getUserProfile(uid).catch(() => null);
      await createNotification(
        current.uid,
        NotificationType.POST_LIKE,
        "New like",
        `${liker?.displayName ?? "Someone"} liked your post.`,
        `/feed/${postId}`,
        liker?.photoURL
      ).catch(() => {});
    }
  } catch (error) {
    await logError(error, { operation: "creatorFeed.likePost", uid, postId });
    throw error;
  }
}

/** Deletes a post. Firestore rules enforce that only the post's own author may do this — this
 * function doesn't re-check ownership client-side, it just relies on the UI only ever showing
 * the delete action on the signed-in user's own posts. */
export async function deletePost(uid: string, postId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, FEED, postId));
  } catch (error) {
    await logError(error, { operation: "creatorFeed.deletePost", uid, postId });
    throw error;
  }
}

/** Real-time listener on the newest page of the "For You" feed — powers new-post-appears-live
 * behavior. Pagination beyond this first page uses the one-shot getPosts()/getFollowingFeed()
 * instead, since a live listener per page would be needlessly expensive. */
export function subscribeToFeed(
  callback: (posts: CreatorPost[]) => void,
  pageSize = 10
): Unsubscribe {
  const q = query(collection(db, FEED), orderBy("createdAt", "desc"), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(toPost)),
    () => callback([])
  );
}

/** Fire-and-forget view counter — called once per viewer per post (the caller is responsible
 * for de-duping, e.g. once per browser session) to power the creator dashboard's per-post
 * analytics. Never throws into the UI; a missed view count isn't worth surfacing an error for. */
export async function incrementPostViews(postId: string): Promise<void> {
  try {
    await updateDoc(doc(db, FEED, postId), { views: increment(1) });
  } catch {
    // Non-fatal — view counts are a nice-to-have, not core functionality.
  }
}

/** Fetches a single post by id — powers app/feed/[postId]'s shared-link view. Returns null both
 * when the post doesn't exist and when the read is denied (e.g. a signed-out visitor, since
 * creatorFeed read access requires being signed in), so the page can render one plain "not
 * found or sign in" state for either case. */
export async function getPost(postId: string): Promise<CreatorPost | null> {
  try {
    const snap = await getDoc(doc(db, FEED, postId));
    return snap.exists() ? toPost(snap as QueryDocumentSnapshot<DocumentData>) : null;
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getPost", postId });
    return null;
  }
}

/** Fetches every post by one creator, newest first — used by the creator dashboard's own Feed
 * tab and the public creator profile's Posts tab. Excludes drafts, since drafts live in a
 * separate per-user subcollection rather than this query's `creatorFeed` collection. */
export async function getPostsByCreator(uid: string): Promise<CreatorPost[]> {
  try {
    const q = query(collection(db, FEED), where("uid", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(toPost);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getPostsByCreator", uid });
    return [];
  }
}

/* ---------------------------- Admin ---------------------------- */

/** Every post, newest first, capped generously rather than paginated — used only by the Super
 * Admin dashboard's Feed tab, whose table already scrolls and filters client-side rather than
 * needing true pagination the way the public feed does. */
export async function getAllPostsForAdmin(cap = 300): Promise<CreatorPost[]> {
  try {
    const q = query(collection(db, FEED), orderBy("createdAt", "desc"), limit(cap));
    const snap = await getDocs(q);
    return snap.docs.map(toPost);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getAllPostsForAdmin" });
    return [];
  }
}

/** Admin override to immediately end a post's boost (e.g. in response to a report), independent
 * of expireBoosts()'s time-based sweep. */
export async function adminClearBoost(postId: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, FEED, postId));
    if (!snap.exists()) return;
    const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
    await updateDoc(doc(db, FEED, postId), {
      boostLevel: 0,
      boostExpiresAt: null,
      forYouScore: calculateForYouScore({ ...post, boostLevel: 0 }),
    });
  } catch (error) {
    await logError(error, { operation: "creatorFeed.adminClearBoost", postId });
    throw error;
  }
}

/** Admin override for a post's For You eligibility — e.g. pulling a specific post out of the
 * algorithmic feed without banning its author outright. */
export async function adminSetForYouEligible(postId: string, eligible: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, FEED, postId), { forYouEligible: eligible });
  } catch (error) {
    await logError(error, { operation: "creatorFeed.adminSetForYouEligible", postId, eligible });
    throw error;
  }
}

/* ---------------------------- View / watch-time tracking ---------------------------- */

/** Distinct-viewer counter for video (and, going forward, any) posts — a superset of the older
 * `incrementPostViews`, which only bumped the legacy `views` field. Recomputes `forYouScore` in
 * the same write so a post's ranking reflects fresh views immediately. De-duping per viewer is
 * the caller's responsibility (FeedPostCard uses sessionStorage, same as the legacy view count). */
export async function incrementViewCount(postId: string): Promise<void> {
  try {
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
    const viewCount = post.viewCount + 1;
    await updateDoc(ref, { viewCount, forYouScore: calculateForYouScore({ ...post, viewCount }) });
  } catch {
    // Non-fatal — view counts are a discovery signal, not core functionality.
  }
}

/** Adds `seconds` to a video post's cumulative watch time (FeedPostCard calls this roughly once
 * every 5s of continued playback) and recomputes `forYouScore`. Never throws into the UI. */
export async function trackWatchTime(postId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  try {
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
    const watchTime = post.watchTime + seconds;
    await updateDoc(ref, { watchTime, forYouScore: calculateForYouScore({ ...post, watchTime }) });
  } catch {
    // Non-fatal.
  }
}

/** Generic "bump one counter field by `delta` and recompute forYouScore" helper — every
 * TikTok-style ranking signal below (completed view, replay, profile visit, share, bookmark)
 * follows the exact same read-then-write shape as incrementViewCount()/trackWatchTime() above,
 * so this factors it out rather than repeating the same six lines five times. `delta` defaults to
 * +1; unsavePost() below passes -1 to undo a bookmark. */
async function bumpEngagementCounter(
  postId: string,
  // "completedViews" is a tracked signal that predates Part 8's scoring rewrite but isn't one of
  // its formula's terms anymore (see calculateForYouScore's doc comment) — bumpEngagementCounter
  // still accepts it since trackVideoCompleted() below still records it for other analytics.
  field: keyof ScoreInput | "completedViews",
  delta = 1
): Promise<void> {
  try {
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
    const nextValue = Math.max(0, ((post[field] as number | undefined) ?? 0) + delta);
    const patch = { [field]: nextValue };
    await updateDoc(ref, { ...patch, forYouScore: calculateForYouScore({ ...post, ...patch }) });
  } catch {
    // Non-fatal — a missed ranking signal isn't worth surfacing an error for.
  }
}

/** Called once per viewing session the first time a video crosses 80% played — the single
 * strongest "this person actually watched it" signal, worth +50 to forYouScore (see
 * calculateForYouScore). De-duping per session is the caller's responsibility (TikTokFeedItem
 * uses a ref flag, same pattern incrementViewCount's callers already use). */
export async function trackVideoCompleted(postId: string): Promise<void> {
  await bumpEngagementCounter(postId, "completedViews");
}

/** Called each time a video loops back to the start while still in view — +30 to forYouScore. */
export async function trackVideoReplay(postId: string): Promise<void> {
  await bumpEngagementCounter(postId, "replayCount");
}

/** Called when a viewer taps through to the author's profile from this specific post — +20 to
 * forYouScore. */
export async function trackProfileVisit(postId: string): Promise<void> {
  await bumpEngagementCounter(postId, "profileVisitsFromPost");
}

/** Called once a share sheet option actually completes (not just opening the sheet) — +60 to
 * forYouScore, the single heaviest signal short of a completed view, since sharing is the
 * clearest "I want other people to see this" signal a viewer can give. */
export async function trackShare(postId: string): Promise<void> {
  await bumpEngagementCounter(postId, "shareCount");
}

/* ---------------------------- Boosting ---------------------------- */

export interface BoostResult {
  success: boolean;
  message?: string;
}

/** Spends coins to boost a post for a limited window — deducts the tier's cost from the author's
 * balance, logs a "boost" transaction, and stamps `boostLevel`/`boostExpiresAt` plus a freshly
 * multiplied `forYouScore` onto the post so the effect is visible immediately rather than after
 * some later recompute pass. Only the post's own author may boost it (mirrors the delete-post
 * ownership check, enforced again server-side by firestore.rules). */
export async function boostPost(uid: string, postId: string, level: 1 | 2 | 3): Promise<BoostResult> {
  const tier = BOOST_TIERS[level];
  try {
    const [profile, snap] = await Promise.all([getUserProfile(uid), getDoc(doc(db, FEED, postId))]);
    if (!snap.exists()) return { success: false, message: "This post no longer exists." };
    const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
    if (post.uid !== uid) return { success: false, message: "You can only boost your own posts." };
    if (!profile || (profile.coins ?? 0) < tier.cost) {
      return { success: false, message: `Not enough coins — ${tier.label} costs ${tier.cost} coins.` };
    }

    const newBalance = profile.coins - tier.cost;
    const boostExpiresAt = new Date(Date.now() + tier.hours * 3_600_000).toISOString();
    const forYouScore = calculateForYouScore({ ...post, boostLevel: level, boostExpiresAt });

    await updateUserPrefs(uid, { coins: newBalance });
    await updateDoc(doc(db, FEED, postId), { boostLevel: level, boostExpiresAt, forYouScore });
    await addDoc(collection(db, "users", uid, "transactions"), {
      userId: uid,
      type: "spend",
      amount: -tier.cost,
      balanceAfter: newBalance,
      description: `${tier.label} on a feed post`,
      category: "boost",
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "creatorFeed.boostPost", uid, postId, level });
    return { success: false, message: "Couldn't boost this post. Please try again." };
  }
}

/** Sweeps every post whose boost has expired and resets it to unboosted, recomputing its
 * (now-unmultiplied) `forYouScore` in the same batch. Cheap enough to call on every feed-page
 * mount: the query only ever matches posts genuinely mid-expiry, which is a small, self-limiting
 * set (each one is fixed the first time anyone calls this after it expires). Client-side rather
 * than a scheduled Cloud Function, since this project has no Cloud Functions deployment. */
export async function expireBoosts(): Promise<void> {
  try {
    // A single inequality filter is enough: unboosted posts have `boostExpiresAt` set to `null`
    // (either from createPost or from a prior sweep), and Firestore range/inequality filters
    // never match `null`, so this only ever matches posts that were genuinely boosted and whose
    // window has passed — no second `boostLevel > 0` filter (and its composite-index cost) needed.
    const q = query(collection(db, FEED), where("boostExpiresAt", "<=", new Date().toISOString()));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      const post = toPost(d as QueryDocumentSnapshot<DocumentData>);
      batch.update(d.ref, {
        boostLevel: 0,
        boostExpiresAt: null,
        forYouScore: calculateForYouScore({ ...post, boostLevel: 0 }),
      });
    });
    await batch.commit();
  } catch (error) {
    // Non-fatal — a missed expiry sweep just means a boost's multiplier lingers a little longer
    // than intended until the next page load runs this again.
    await logError(error, { operation: "creatorFeed.expireBoosts" });
  }
}

/* ---------------------------- Drafts ---------------------------- */

function draftsCol(uid: string) {
  return collection(db, "users", uid, "drafts");
}

/** Saves (or overwrites, if `draftId` is given) a private draft under the author's own
 * `users/{uid}/drafts` subcollection — never the shared `creatorFeed` collection, so a draft is
 * never visible to anyone but its author even if the feed query logic has a bug. Returns the
 * draft's id. */
/** Recursively strips `undefined` values (top-level and nested one level, which is as deep as
 * any caller here actually nests — e.g. `badges`) from an object. Firestore's `addDoc`/
 * `updateDoc` reject any field whose value is `undefined` (as opposed to simply omitting the
 * key), and unlike createPost() — which builds its payload field-by-field with explicit `?? `
 * fallbacks — saveDraft() accepts a loose `Partial<CreatePostInput>` straight from the composer,
 * where e.g. `badges.isVerified` is `undefined` on any profile that hasn't set it. Stripping
 * here rather than in every caller keeps that guarantee in one place. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    out[key] =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? stripUndefined(value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

export async function saveDraft(
  uid: string,
  draft: Partial<CreatePostInput> & { draftId?: string }
): Promise<string> {
  const { draftId, ...fields } = draft;
  try {
    const payload = stripUndefined({ ...fields, uid, isDraft: true, draftSavedAt: new Date().toISOString() });
    if (draftId) {
      await updateDoc(doc(draftsCol(uid), draftId), payload);
      return draftId;
    }
    const ref = await addDoc(draftsCol(uid), payload);
    return ref.id;
  } catch (error) {
    await logError(error, { operation: "creatorFeed.saveDraft", uid });
    throw error;
  }
}

/** All of one creator's saved drafts, most-recently-saved first. */
export async function getDrafts(uid: string): Promise<CreatorPost[]> {
  try {
    const q = query(draftsCol(uid), orderBy("draftSavedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(toPost);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getDrafts", uid });
    return [];
  }
}

export async function deleteDraft(uid: string, draftId: string): Promise<void> {
  try {
    await deleteDoc(doc(draftsCol(uid), draftId));
  } catch (error) {
    await logError(error, { operation: "creatorFeed.deleteDraft", uid, draftId });
    throw error;
  }
}

/** Publishes a saved draft to the live feed via the normal createPost() path, then deletes the
 * draft. Takes the same fields getForYouEligibility()'s caller would already have computed, plus
 * an explicit `forYouEligible` so this doesn't need its own role lookup. */
export async function publishDraft(uid: string, draftId: string, input: CreatePostInput): Promise<string> {
  const postId = await createPost(input);
  await deleteDraft(uid, draftId);
  return postId;
}

/* ---------------------------- Feed post comments (TikTok Feed Overhaul) ---------------------------- */

function feedCommentsCol(postId: string) {
  return collection(db, FEED, postId, "comments");
}

/** Real-time listener on a post's comments, newest first — powers the comment sheet. Unlike
 * series comments (paginated with a `take` + "Load more"), a feed post's comment sheet just
 * shows everything at once; TikTok-scale comment counts on a single post are rare enough here
 * that this doesn't need its own pagination yet. */
export function subscribeToFeedComments(
  postId: string,
  callback: (comments: FeedComment[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(feedCommentsCol(postId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FeedComment)),
    onError
  );
}

/** Posts a comment (or reply, via `parentId`) and bumps the post's `commentCount` (+ recomputes
 * forYouScore — a comment is a strong TikTok-style engagement signal, see
 * calculateForYouScore) in the same call. */
export async function addFeedComment(
  postId: string,
  comment: Omit<FeedComment, "id" | "createdAt" | "likes">
): Promise<void> {
  try {
    await addDoc(feedCommentsCol(postId), {
      ...comment,
      likes: [],
      createdAt: new Date().toISOString(),
    });
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
      const commentCount = post.commentCount + 1;
      await updateDoc(ref, { commentCount, forYouScore: calculateForYouScore({ ...post, commentCount }) });
    }
    await updateLastActive(comment.uid);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.addFeedComment", postId });
    throw error;
  }
}

export async function toggleFeedCommentLike(
  postId: string,
  commentId: string,
  uid: string,
  currentlyLiked: boolean
): Promise<void> {
  try {
    await updateDoc(doc(feedCommentsCol(postId), commentId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  } catch (error) {
    await logError(error, { operation: "creatorFeed.toggleFeedCommentLike", postId, commentId });
    throw error;
  }
}

/** Soft-deletes a comment (same pattern as series comments — the doc stays so any replies under
 * it keep a parent to render against) and decrements the post's commentCount. */
export async function deleteFeedComment(postId: string, commentId: string): Promise<void> {
  try {
    await updateDoc(doc(feedCommentsCol(postId), commentId), {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      text: "Comment deleted",
    });
    const ref = doc(db, FEED, postId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const post = toPost(snap as QueryDocumentSnapshot<DocumentData>);
      const commentCount = Math.max(0, post.commentCount - 1);
      await updateDoc(ref, { commentCount, forYouScore: calculateForYouScore({ ...post, commentCount }) });
    }
  } catch (error) {
    await logError(error, { operation: "creatorFeed.deleteFeedComment", postId, commentId });
    throw error;
  }
}

/* ---------------------------- Saved posts (bookmark) ---------------------------- */

function savedPostsCol(uid: string) {
  return collection(db, "users", uid, "savedPosts");
}

export async function savePost(uid: string, post: CreatorPost): Promise<void> {
  try {
    await setDoc(doc(savedPostsCol(uid), post.id), {
      postId: post.id,
      uid: post.uid,
      displayName: post.displayName,
      photoURL: post.photoURL ?? null,
      content: post.content,
      mediaType: post.mediaType ?? "none",
      attachments: post.attachments ?? [],
      videoUrl: post.videoUrl ?? null,
      videoPosterUrl: post.videoPosterUrl ?? null,
      savedAt: new Date().toISOString(),
    });
    await bumpEngagementCounter(post.id, "bookmarkCount", 1);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.savePost", uid, postId: post.id });
    throw error;
  }
}

export async function unsavePost(uid: string, postId: string): Promise<void> {
  try {
    await deleteDoc(doc(savedPostsCol(uid), postId));
    await bumpEngagementCounter(postId, "bookmarkCount", -1);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.unsavePost", uid, postId });
    throw error;
  }
}

export interface SavedPostEntry {
  postId: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  content: string;
  mediaType: CreatorPost["mediaType"];
  attachments: string[];
  videoUrl?: string;
  videoPosterUrl?: string;
  savedAt: string;
}

/** Real-time set of postIds the signed-in viewer has saved — one listener per feed session
 * (mounted once, not per-card) so every TikTokFeedItem's bookmark button can just check
 * membership instead of each running its own Firestore read. */
export function subscribeToSavedPostIds(uid: string, callback: (ids: Set<string>) => void): Unsubscribe {
  return onSnapshot(
    savedPostsCol(uid),
    (snap) => callback(new Set(snap.docs.map((d) => d.id))),
    () => callback(new Set())
  );
}

/** Every post the profile's Library tab "Saved Posts" section shows, most-recently-saved first. */
export async function getSavedPosts(uid: string): Promise<SavedPostEntry[]> {
  try {
    const q = query(savedPostsCol(uid), orderBy("savedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SavedPostEntry);
  } catch (error) {
    await logError(error, { operation: "creatorFeed.getSavedPosts", uid });
    return [];
  }
}
