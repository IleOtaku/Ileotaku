"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Hash, Loader2 } from "lucide-react";
import { getPostsByHashtag } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";
import FeedPostCard from "./FeedPostCard";

export interface HashtagFeedClientProps {
  tag: string;
}

/** Beta feedback: "add ... hashtags to feed" — the destination a #hashtag token (MentionText)
 * links to. Deliberately its own simple, non-paginated list rather than a third mode bolted onto
 * FeedClient's already-intricate forYou/following pagination state — a single tag's results are
 * small enough (see getPostsByHashtag's own cap) that true pagination isn't needed here. */
export default function HashtagFeedClient({ tag }: HashtagFeedClientProps) {
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPostsByHashtag(tag).then((result) => {
      if (!cancelled) {
        setPosts(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href="/feed" className="mb-4 flex items-center gap-1.5 font-noto text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Link>
      <h1 className="mb-6 flex items-center gap-1.5 font-cinzel text-2xl text-text">
        <Hash className="h-6 w-6 text-gold" />
        {tag}
      </h1>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : posts.length === 0 ? (
        <p className="py-16 text-center font-noto text-sm text-muted">No posts tagged #{tag} yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <FeedPostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
