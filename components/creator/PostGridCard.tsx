"use client";

import { Heart, Play } from "lucide-react";
import type { CreatorPost } from "@/types";

export interface PostGridCardProps {
  post: CreatorPost;
  onClick: () => void;
}

/** Small rectangular preview card for a creator's Posts tab — beta feedback: "should just be
 * small cards and not the entire post... like tiktok's." Shows the post's own thumbnail (video
 * poster, first image, or a gradient-and-text preview for a text-only post) plus a like count;
 * tapping opens the full post in CreatorPostsViewer. */
export default function PostGridCard({ post, onClick }: PostGridCardProps) {
  const isVideo = post.mediaType === "video" && !!post.videoUrl;
  const thumbnail = isVideo ? post.videoPosterUrl : post.attachments?.[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-bg3"
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          src={thumbnail}
          alt=""
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-clay/40 to-bg3 p-3">
          <p className="line-clamp-4 text-center font-noto text-xs text-white/90">{post.content}</p>
        </div>
      )}

      {isVideo && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white">
          <Play className="h-2.5 w-2.5 fill-current" />
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <Heart className="h-3 w-3 fill-white text-white" />
        <span className="font-syne text-[11px] font-semibold text-white">{post.likes.length}</span>
      </div>
    </button>
  );
}
