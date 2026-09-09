"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Flame, Rocket, Trash2, Video, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { adminClearBoost, deletePost, getAllPostsForAdmin } from "@/lib/creatorFeed";
import { formatTime } from "@/lib/utils";
import type { CreatorPost } from "@/types";

type MediaFilter = "all" | "video" | "image" | "none";
type BoostFilter = "all" | "boosted" | "notBoosted";

const MEDIA_OPTIONS: { label: string; value: MediaFilter }[] = [
  { label: "All media", value: "all" },
  { label: "Video", value: "video" },
  { label: "Image", value: "image" },
  { label: "Text only", value: "none" },
];

const BOOST_OPTIONS: { label: string; value: BoostFilter }[] = [
  { label: "All boost states", value: "all" },
  { label: "Boosted", value: "boosted" },
  { label: "Not boosted", value: "notBoosted" },
];

function isActivelyBoosted(post: CreatorPost): boolean {
  return post.boostLevel > 0 && !!post.boostExpiresAt && new Date(post.boostExpiresAt).getTime() > Date.now();
}

/** Admin Feed tab — a table over every creatorFeed post with media/boost filters, a stats row,
 * and per-row moderation actions (clear an active boost, delete the post outright). */
export default function AdminFeedTab() {
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [boostFilter, setBoostFilter] = useState<BoostFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getAllPostsForAdmin()
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(
    () => ({
      total: posts.length,
      videos: posts.filter((p) => p.mediaType === "video").length,
      boosted: posts.filter(isActivelyBoosted).length,
      totalViews: posts.reduce((sum, p) => sum + (p.viewCount || 0), 0),
    }),
    [posts]
  );

  const filtered = useMemo(
    () =>
      posts.filter((p) => {
        if (mediaFilter !== "all" && (p.mediaType ?? "none") !== mediaFilter) return false;
        if (boostFilter === "boosted" && !isActivelyBoosted(p)) return false;
        if (boostFilter === "notBoosted" && isActivelyBoosted(p)) return false;
        return true;
      }),
    [posts, mediaFilter, boostFilter]
  );

  async function handleClearBoost(postId: string) {
    setBusyId(postId);
    try {
      await adminClearBoost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, boostLevel: 0, boostExpiresAt: undefined } : p))
      );
      toast.success("Boost cleared.");
    } catch {
      toast.error("Couldn't clear this post's boost.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(postId: string) {
    setBusyId(postId);
    try {
      await deletePost("admin", postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted.");
    } catch {
      toast.error("Couldn't delete this post.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-bg4 bg-bg2 p-4">
          <p className="font-noto text-xs text-muted">Total posts</p>
          <p className="font-cinzel text-xl text-text">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-bg4 bg-bg2 p-4">
          <p className="flex items-center gap-1 font-noto text-xs text-muted">
            <Video className="h-3 w-3" /> Video posts
          </p>
          <p className="font-cinzel text-xl text-text">{stats.videos}</p>
        </div>
        <div className="rounded-xl border border-bg4 bg-bg2 p-4">
          <p className="flex items-center gap-1 font-noto text-xs text-muted">
            <Rocket className="h-3 w-3" /> Actively boosted
          </p>
          <p className="font-cinzel text-xl text-text">{stats.boosted}</p>
        </div>
        <div className="rounded-xl border border-bg4 bg-bg2 p-4">
          <p className="flex items-center gap-1 font-noto text-xs text-muted">
            <Eye className="h-3 w-3" /> Total views
          </p>
          <p className="font-cinzel text-xl text-text">{stats.totalViews}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={mediaFilter}
          onChange={(e) => setMediaFilter(e.target.value as MediaFilter)}
          className="input-base w-auto text-sm"
        >
          {MEDIA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={boostFilter}
          onChange={(e) => setBoostFilter(e.target.value as BoostFilter)}
          className="input-base w-auto text-sm"
        >
          {BOOST_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bg4">
        <table className="w-full text-left font-noto text-sm">
          <thead className="bg-bg3 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Creator</th>
              <th className="px-3 py-2">Content</th>
              <th className="px-3 py-2">Media</th>
              <th className="px-3 py-2">Views</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Posted</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg4">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No posts match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((post) => (
                <tr key={post.id} className="align-top">
                  <td className="px-3 py-2 text-text">{post.displayName}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted">{post.content}</td>
                  <td className="px-3 py-2">
                    {post.mediaType === "video" ? (
                      <span className="flex items-center gap-1 text-clay2">
                        <Video className="h-3.5 w-3.5" /> {post.videoResolution ?? "video"}
                      </span>
                    ) : post.mediaType === "image" || post.mediaType === "images" ? (
                      <span className="text-muted">{post.imageResolution ?? "image"}</span>
                    ) : (
                      <span className="text-muted">text</span>
                    )}
                    {isActivelyBoosted(post) && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-gold">
                        <Flame className="h-3 w-3" /> boosted
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{post.viewCount}</td>
                  <td className="px-3 py-2 text-muted">{post.forYouScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-muted">{formatTime(post.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {isActivelyBoosted(post) && (
                        <button
                          type="button"
                          onClick={() => handleClearBoost(post.id)}
                          disabled={busyId === post.id}
                          className="flex items-center gap-1 rounded-full bg-bg3 px-2 py-1 text-xs text-gold hover:bg-bg4"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Clear boost
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id)}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1 rounded-full bg-bg3 px-2 py-1 text-xs text-clay2 hover:bg-bg4"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
