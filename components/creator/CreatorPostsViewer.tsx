"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import TikTokFeedItem from "@/components/feed/TikTokFeedItem";
import type { CreatorPost } from "@/types";

export interface CreatorPostsViewerProps {
  posts: CreatorPost[];
  startIndex: number;
  onClose: () => void;
}

/** Beta feedback: "The post section on user's profile should just be small cards... Tapping one
 * would open the post with a back arrow button top left and scrolling takes you to the next post
 * of that user till you scroll to the end." Reuses the exact TikTok-style item /feed itself
 * renders (likes/comments/share/save, video controls, badges — all of it for free) inside its own
 * snap-scroll stack, scoped to just this one creator's posts, jumped to the tapped card on open. */
export default function CreatorPostsViewer({ posts, startIndex, onClose }: CreatorPostsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: startIndex * el.clientHeight });
    // Only ever jump to the tapped card once, on open — a real scroll position after that should
    // never be fought by this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="Back"
        className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div ref={containerRef} className="h-full w-full snap-y snap-mandatory overflow-y-scroll">
        {posts.map((post) => (
          <TikTokFeedItem key={post.id} post={post} isSaved={false} onDeleted={onClose} />
        ))}
      </div>
    </div>
  );
}
