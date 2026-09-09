"use client";

import { useEffect, useState } from "react";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { Skeleton } from "@/components/ui";
import { getPosts } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";

const PREVIEW_COUNT = 3;

/** Home page preview of the Creator Feed for signed-in users — the latest few posts from any
 * creator, each a real FeedPostCard (so liking/sharing/reporting work right from the home page
 * too), with "View All" linking to the full /feed. Renders nothing once loaded if there simply
 * aren't any posts yet, rather than showing an empty section. */
export default function CreatorUpdatesSection() {
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPosts(PREVIEW_COUNT)
      .then((page) => {
        if (!cancelled) setPosts(page.posts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {posts.map((post) => (
        <FeedPostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
