"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import FeedPostCard from "@/components/feed/FeedPostCard";
import PostComposer from "@/components/feed/PostComposer";
import { EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getPostsByCreator } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";

/** Profile page's Posts tab: the signed-in user's own feed posts, or a nudge to become a
 * creator when they aren't one — a non-creator has nothing to post and no posts to show. */
export default function ProfilePostsTab() {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const canPost = profile?.isCreator === true || profile?.isPublisher === true;

  useEffect(() => {
    if (!user || !canPost) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getPostsByCreator(user.uid)
      .then(setPosts)
      .finally(() => setLoading(false));
  }, [user, canPost]);

  if (!canPost) {
    return (
      <EmptyState
        icon={<Flame className="h-6 w-6 text-muted" />}
        title="Become a creator to start posting"
        description="Activate a creator account to share updates, previews, and announcements with your followers."
        action={
          <Link href="/creator" className="btn-primary">
            Go to Creator Studio
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PostComposer
        onPosted={() => {
          if (user) getPostsByCreator(user.uid).then(setPosts);
        }}
      />
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Share your first update above." />
      ) : (
        posts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))
      )}
    </div>
  );
}
