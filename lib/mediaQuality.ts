import type { CreatorPost } from "@/types";

/**
 * Beta feedback: "The HD 2K & 4K features should use an ai or something to enhance the photo and video
 * quality to that level if it's not already that level. If it's 4k and 720 is picked, it should reduce
 * quality to 720."
 *
 * Until now the resolution tier a creator picked was only a label (and a coin price) stored on the post;
 * every photo was served at 800px and every video at whatever was uploaded. This turns the tier into what
 * viewers actually receive, through Cloudinary's delivery transformations — nothing is re-uploaded and the
 * original file is never touched, so a creator can change their mind by editing the tier:
 *
 *  - PHOTOS: an image smaller than the tier's target gets Cloudinary's AI upscaler (`e_upscale`, verified
 *    working on this account), guarded so it only runs when the source is small enough for the model
 *    (< 4 megapixels) and only when the picture is actually below the target; anything larger than the
 *    target is scaled DOWN to it (`c_limit`), so a 4K photo posted at "HD" is delivered at HD.
 *  - VIDEOS: a video taller than the tier is scaled down to it (a 4K clip posted at 720p plays at 720p).
 *    Videos are deliberately NOT upscaled — there's no AI video enhancer available to us, and plain
 *    stretching a 480p clip to 4K only multiplies the file size (43 MB for a short clip in testing)
 *    without adding any detail.
 *
 * Every helper returns the untouched URL for non-Cloudinary media, and the components that use these fall
 * back to the original URL if the derived one fails to load, so a tier can never break a post.
 */
type ImageTier = NonNullable<CreatorPost["imageResolution"]>;
type VideoTier = NonNullable<CreatorPost["videoResolution"]>;

/** Long-edge target in pixels per photo tier. "standard" keeps the old 800px feed size. */
export const IMAGE_TIER_PIXELS: Record<ImageTier, number> = { standard: 800, hd: 1920, "2k": 2560, "4k": 3840 };
/** Height cap in pixels per video tier. */
export const VIDEO_TIER_HEIGHT: Record<VideoTier, number> = { "480p": 480, "720p": 720, "1080p": 1080, "2k": 1440, "4k": 2160 };

function insertTransform(url: string, transform: string): string | null {
  if (!url || !url.includes("res.cloudinary.com")) return null;
  const marker = url.includes("/upload/") ? "/upload/" : null;
  return marker ? url.replace(marker, `${marker}${transform}/`) : null;
}

/** The URL a feed photo should be shown from for its tier. */
export function tierImageUrl(url: string, tier: ImageTier | undefined): string {
  if (!tier || tier === "standard") return url;
  const px = IMAGE_TIER_PIXELS[tier];
  const chain = [
    // AI-enhance only pictures that are below the target on BOTH sides and small enough for the model.
    `if_w_lt_${px}_and_h_lt_${px}_and_w_mul_h_lt_4000000`,
    "e_upscale",
    "if_end",
    // …then never deliver more than the tier: bigger originals are scaled down to it.
    `c_limit,w_${px},h_${px}`,
    "q_auto:best,f_auto",
  ].join("/");
  return insertTransform(url, chain) ?? url;
}

/** The URL a feed video should play from for its tier (scaled down when the original is taller). */
export function tierVideoUrl(url: string, tier: VideoTier | undefined): string {
  if (!url || !tier) return url;
  const h = VIDEO_TIER_HEIGHT[tier];
  return insertTransform(url, `if_h_gt_${h}/c_limit,h_${h}/if_end`) ?? url;
}

/** Asks Cloudinary to generate a photo's tier version right now (the AI upscale takes several seconds the
 * first time), so it's ready by the time anyone scrolls to the post instead of making the first viewer —
 * usually the creator — wait for it. Fire and forget. */
export function warmImageTier(url: string, tier: ImageTier | undefined): void {
  if (typeof window === "undefined" || !tier || tier === "standard") return;
  const derived = tierImageUrl(url, tier);
  if (derived === url) return;
  const img = new Image();
  img.src = derived;
}
