"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import TikTokFeedItem from "./TikTokFeedItem";
import FeedSoundToggle from "./FeedSoundToggle";
import { useAuth } from "@/hooks/useAuth";
import { getPost, subscribeToSavedPostIds } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";

export interface SinglePostClientProps {
  postId: string;
}

/** Client half of the shared-post page — fetches the one post and renders it as a single
 * full-viewport TikTokFeedItem slide, with a back-to-feed link and its own sound toggle since
 * this route isn't nested inside FeedClient's chrome. */
export default function SinglePostClient({ postId }: SinglePostClientProps) {
  const { user } = useAuth();
  const [post, setPost] = useState<CreatorPost | null | undefined>(undefined);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPost(postId).then(setPost);
  }, [postId]);

  useEffect(() => {
    if (!user) return;
    return subscribeToSavedPostIds(user.uid, setSavedIds);
  }, [user]);

  if (post === undefined) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (post === null) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="font-cinzel text-lg">This post isn&apos;t available</p>
        <p className="font-noto text-sm text-white/60">
          {user ? "It may have been deleted." : "Sign in to view it."}
        </p>
        <Link href="/feed" className="btn-primary">
          Go to Feed
        </Link>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full bg-black">
      <div className="absolute left-3 top-3 z-30">
        <Link
          href="/feed"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label="Back to feed"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      <div className="absolute right-3 top-3 z-30">
        <FeedSoundToggle />
      </div>
      <TikTokFeedItem post={post} isSaved={savedIds.has(post.id)} onDeleted={() => setPost(null)} />
    </div>
  );
}
