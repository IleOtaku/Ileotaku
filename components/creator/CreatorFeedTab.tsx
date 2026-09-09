"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Heart, MessageCircle, Trash2 } from "lucide-react";
import PostComposer from "@/components/feed/PostComposer";
import { EmptyState, Skeleton } from "@/components/ui";
import { deletePost, getPostsByCreator } from "@/lib/creatorFeed";
import { formatTime } from "@/lib/utils";
import type { CreatorPost } from "@/types";

export interface CreatorFeedTabProps {
  uid: string;
}

/** Creator Studio's own Feed tab: the composer plus a list of the creator's own posts with
 * lightweight per-post analytics (views, likes, comments) and a delete action on each. */
export default function CreatorFeedTab({ uid }: CreatorFeedTabProps) {
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPosts(await getPostsByCreator(uid));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(postId: string) {
    try {
      await deletePost(uid, postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted.");
    } catch {
      toast.error("Couldn't delete this post.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PostComposer onPosted={refresh} />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Share an update above to reach your followers." />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[11px] font-semibold text-clay2">
                    {post.type}
                  </span>
                  <p className="mt-2 line-clamp-2 font-noto text-sm text-text">{post.content}</p>
                  <p className="mt-1 font-noto text-[11px] text-muted">{formatTime(post.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  aria-label="Delete post"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-clay/10 hover:text-clay2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4 border-t border-bg4 pt-3 font-noto text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> {post.views ?? 0} views
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" /> {post.likes.length} likes
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" /> {post.commentCount} comments
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
