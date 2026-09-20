/**
 * ÍléOtaku's For You reach algorithm — "our personal algorithm, secrets shouldn't be known" (beta feedback
 * from the owner, verbatim spec below). Deliberately ONE file of pure functions so the whole policy lives
 * in one place and can be tuned or replaced without touching the feed plumbing. Nothing here talks to
 * Firestore.
 *
 * THE POLICY (from the feedback):
 *  - Everyone can post. Verified accounts always get engagement; unverified ones mostly reach only their
 *    own followers.
 *  - GOLD (the Founder): every user sees the post — 100% of viewers, sometimes 80%, sometimes 60%, never
 *    below 60%.
 *  - PURPLE (Publisher): seen by the majority.
 *  - BLUE (Creator): their followers plus a small % outside them.
 *  - WHITE (general verified): their followers plus a little % outside them.
 *  - UNVERIFIED: pushed to the Following page only … except that once in a while, by random pick, an
 *    unverified user's post is pushed to For You for ~80% of users.
 *  - CONSISTENCY decides whether a post is even in the running for outside reach: Purple needs no constant
 *    posting, Blue needs a little, White needs minimal, Unverified needs back-to-back posting. A post whose
 *    author isn't consistent enough only reaches followers.
 *  - BOOSTING always gets a post onto For You but doesn't promise a big audience: it reaches about 5–50% of
 *    users, scaled by tier — a Purple boost gets 45–50%, and it scales down from there.
 *
 * HOW "X% OF USERS" IS DECIDED: there is no per-viewer table to maintain. Whether viewer V sees post P is a
 * stable hash of (V, P) compared with P's reach fraction — so the same viewer always gets the same answer
 * for a post (no flicker on refresh), and across many viewers the share who see it converges to the
 * fraction. P's own reach fraction is also a stable hash of P, which is what makes a Gold post "sometimes
 * 80, sometimes 60" without storing anything.
 *
 * Followers always see their followed authors' posts (the Following feed is untouched) and authors always
 * see their own.
 */
import type { CreatorPost } from "@/types";

export type ReachTier = "gold" | "purple" | "blue" | "white" | "none";

/** The verification fields a post carries (denormalized onto it at creation time). */
export type ReachBadges = Pick<CreatorPost, "isFounder" | "isAdmin" | "isVerified" | "verifiedType" | "isPublisher">;

/** Which reach tier an author belongs to, from the badge fields on their post. Founder is gold; an Admin is
 * treated as purple-level (seen by the majority); the rest follow the badge colours in lib/verification.ts. */
export function reachTierOf(b: Partial<ReachBadges>): ReachTier {
  if (b.isFounder) return "gold";
  if (b.isAdmin) return "purple";
  const type = b.verifiedType ?? (b.isPublisher ? "publisher" : undefined);
  if (b.isVerified && type === "publisher") return "purple";
  if (b.isVerified && type === "creator") return "blue";
  if (b.isVerified) return "white";
  return "none";
}

/** Stable hash of a string to [0, 1) (FNV-1a). Same input → same output, everywhere, forever. */
export function hash01(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Share of NON-followers who may see an ORGANIC post in For You, per tier. Bands are wide enough that two
 * posts by the same author differ, narrow enough that the tiers never overlap into each other's territory. */
const ORGANIC_OUTSIDE: Record<Exclude<ReachTier, "gold" | "none">, [number, number]> = {
  purple: [0.55, 0.75], // "seen by the majority"
  blue: [0.1, 0.2], // "a small % outside"
  white: [0.04, 0.1], // "a little % outside"
};

/** An unverified post that wins the lottery is pushed to this share of users… */
export const LUCKY_PICK_REACH = 0.8;
/** …and this share of consistent, unverified posts wins it ("only once in a while"). */
export const LUCKY_PICK_CHANCE = 0.08;

/** What a BOOST reaches, per tier: [level-1 boost, level-3 boost]. "Gets you to just about 5–50% of users…
 * a purple verified boost gets them 45–50%… scale it down like that." */
const BOOST_REACH: Record<Exclude<ReachTier, "gold">, [number, number]> = {
  purple: [0.45, 0.5],
  blue: [0.25, 0.35],
  white: [0.12, 0.22],
  none: [0.05, 0.1],
};

/** Reach of a post's ORGANIC run, as the fraction of non-follower viewers who may see it. */
export function organicReach(post: { id: string } & Partial<ReachBadges> & { reachConsistent?: boolean }): number {
  const tier = reachTierOf(post);
  if (tier === "gold") {
    const r = hash01(`${post.id}:gold`);
    return r < 0.5 ? 1 : r < 0.8 ? 0.8 : 0.6; // 100% most often, sometimes 80, sometimes 60 — never below 60
  }
  if (tier === "none") {
    // Unverified: followers only, unless the author has been posting back-to-back AND this post wins the draw.
    return post.reachConsistent && hash01(`${post.id}:lucky`) < LUCKY_PICK_CHANCE ? LUCKY_PICK_REACH : 0;
  }
  // Purple has no consistency requirement; Blue / White only get outside reach while they keep posting.
  if (tier !== "purple" && post.reachConsistent === false) return 0;
  const [lo, hi] = ORGANIC_OUTSIDE[tier];
  return lerp(lo, hi, hash01(`${post.id}:organic`));
}

/** Reach while a boost is active. Boosting always puts a post in For You (an unverified post included), but
 * the audience it buys is capped by who's boosting — level 3 pushes toward the top of the tier's range. */
export function boostReach(post: { id: string; boostLevel?: number } & Partial<ReachBadges>): number {
  const tier = reachTierOf(post);
  if (tier === "gold") return 1;
  const level = Math.min(3, Math.max(1, post.boostLevel ?? 1));
  const [lo, hi] = BOOST_REACH[tier];
  const t = (level - 1) / 2;
  // A little per-post jitter so two level-2 boosts don't land on exactly the same number.
  const jitter = (hash01(`${post.id}:boost`) - 0.5) * 0.04;
  return Math.min(hi + 0.005, Math.max(lo - 0.005, lerp(lo, hi, t) + jitter));
}

/** The fraction of non-follower viewers this post is currently open to. */
export function currentReach(
  post: { id: string; boostLevel?: number; boostExpiresAt?: string | null; reachConsistent?: boolean } & Partial<ReachBadges>,
  now = Date.now()
): number {
  const boosted = (post.boostLevel ?? 0) > 0 && (!post.boostExpiresAt || new Date(post.boostExpiresAt).getTime() > now);
  const organic = organicReach(post);
  return boosted ? Math.max(organic, boostReach(post)) : organic;
}

/** Should `viewerUid` see this post in their For You feed? Authors always see their own; a follower always
 * sees the people they follow; everyone else is a stable per-(viewer, post) draw against the post's reach. */
export function viewerSees(
  post: { id: string; uid: string; boostLevel?: number; boostExpiresAt?: string | null; reachConsistent?: boolean } & Partial<ReachBadges>,
  viewerUid: string | undefined,
  followsAuthor: boolean,
  now = Date.now()
): boolean {
  if (viewerUid && viewerUid === post.uid) return true;
  if (followsAuthor) return true;
  const reach = currentReach(post, now);
  if (reach >= 1) return true;
  if (reach <= 0) return false;
  // Signed-out viewers share one bucket, so they still see a proportionate slice.
  return hash01(`${viewerUid ?? "anon"}:${post.id}`) < reach;
}

/** Posting-consistency requirement per tier, as { how many earlier posts, within how many days }. Purple
 * needs nothing; Blue a bit; White minimal; Unverified needs to be posting back to back. */
const CONSISTENCY: Record<ReachTier, { posts: number; days: number } | null> = {
  gold: null,
  purple: null,
  blue: { posts: 1, days: 14 },
  white: { posts: 1, days: 30 },
  none: { posts: 2, days: 3 },
};

/** Given the timestamps (ISO) of an author's EARLIER posts, is the post they're about to publish
 * "consistent" for their tier? Computed once at publish time and stored on the post as `reachConsistent`. */
export function isConsistentPoster(tier: ReachTier, earlierPostDates: string[], now = Date.now()): boolean {
  const need = CONSISTENCY[tier];
  if (!need) return true;
  const cutoff = now - need.days * 86_400_000;
  return earlierPostDates.filter((d) => new Date(d).getTime() >= cutoff).length >= need.posts;
}
