"use client";

import { useState } from "react";
import { Eye, Play } from "lucide-react";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { Skeleton } from "@/components/ui";
import type { CreatorPost } from "@/types";

export interface PostGridCardProps {
  post: CreatorPost;
  onClick: () => void;
}

/** Small square preview cell for a creator's Posts tab — beta feedback: "should just be small
 * cards and not the entire post... like tiktok's" / "3 column grid... like Instagram/TikTok
 * profile grid." Shows the post's own thumbnail (video poster, first image, or a gradient-and-text
 * preview for a text-only post) plus a view count; tapping opens the full post in
 * CreatorPostsViewer.
 *
 * Beta feedback bug: "Videos and image preview... aren't showing their previews. Just broken
 * images." Fixes: (1) recomputes the video poster fresh via getVideoThumbnail(videoUrl) instead of
 * trusting the stored videoPosterUrl field, which every post created before getVideoThumbnail's
 * latest fix has saved with a URL that 404s — this self-heals old posts with no backfill needed;
 * (2) a loading skeleton behind the image so a slow Cloudinary fetch doesn't show empty/broken
 * space; (3) an onError fallback — if a thumbnail URL genuinely fails to load (a deleted asset, a
 * transient Cloudinary error), the cell drops back to the same colored text-preview treatment as a
 * text-only post instead of a browser's broken-image icon. */
export default function PostGridCard({ post, onClick }: PostGridCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const isVideo = post.mediaType === "video" && !!post.videoUrl;
  // getVideoThumbnail hands back the video URL unchanged when it isn't a Cloudinary video — useless
  // in an <img> — so only then fall back to the stored videoPosterUrl.
  const derivedPoster = isVideo && post.videoUrl ? getVideoThumbnail(post.videoUrl) : undefined;
  const thumbnail =
    isVideo && post.videoUrl
      ? derivedPoster !== post.videoUrl
        ? derivedPoster
        : post.videoPosterUrl
      : post.attachments?.[0];
  const showFallback = !thumbnail || imgFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square w-full overflow-hidden bg-bg3"
    >
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-clay/40 to-bg3 p-3">
          <p className="line-clamp-4 text-center font-noto text-xs text-white/90">
            {post.content.slice(0, 60)}
          </p>
        </div>
      ) : (
        <>
          {!imgLoaded && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            loading="lazy"
            src={thumbnail}
            alt=""
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      )}

      {isVideo && !showFallback && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="h-4 w-4 fill-current" />
          </span>
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <Eye className="h-3 w-3 text-white" />
        <span className="font-syne text-[11px] font-semibold text-white">{post.viewCount ?? 0}</span>
      </div>
    </button>
  );
}
