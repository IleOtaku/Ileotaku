"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import BoostModal from "./BoostModal";
import FeedCommentSheet from "./FeedCommentSheet";
import FeedShareSheet from "./FeedShareSheet";
import FollowButton from "@/components/social/FollowButton";
import ReportButton from "@/components/social/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge, VerifiedBadge } from "@/components/ui/Badges";
import MentionText from "@/components/ui/MentionText";
import { useAuth } from "@/hooks/useAuth";
import { useFeedAudio } from "@/lib/audioContext";
import {
  deletePost,
  incrementViewCount,
  likePost,
  savePost,
  trackProfileVisit,
  trackVideoCompleted,
  trackVideoReplay,
  trackWatchTime,
  unsavePost,
} from "@/lib/creatorFeed";
import { formatPostTimestamp, getUserProfileUrl, stringToColor } from "@/lib/utils";
import type { CreatorPost } from "@/types";

const BRAND_GRADIENTS = [
  "linear-gradient(135deg, #c4622d, #d4a843)",
  "linear-gradient(135deg, #3d6b4f, #9ecfef)",
  "linear-gradient(135deg, #7d6b9e, #d46a86)",
  "linear-gradient(135deg, #d4a843, #4e8a64)",
];

function brandGradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return BRAND_GRADIENTS[hash % BRAND_GRADIENTS.length];
}

export interface TikTokFeedItemProps {
  post: CreatorPost;
  isSaved: boolean;
  onDeleted: (postId: string) => void;
}

/**
 * One full-viewport slide of the TikTok-style feed — the main /feed page renders a vertical
 * scroll-snap stack of these. Distinct from the older FeedPostCard (still used by the linear
 * Instagram-style lists on creator/profile pages), which stays muted-by-default and doesn't need
 * any of the double-tap/action-stack/comment-sheet chrome this needs.
 */
function TikTokFeedItem({ post, isSaved, onDeleted }: TikTokFeedItemProps) {
  const { user, profile } = useAuth();
  const { effectiveMuted, volume, currentVideoId, playVideo, pauseVideo } = useFeedAudio();

  const [likes, setLikes] = useState(post.likes);
  const [liking, setLiking] = useState(false);
  const [saved, setSaved] = useState(isSaved);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [likeBurst, setLikeBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const [inView, setInView] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTapRef = useRef(0);
  const viewCountedRef = useRef(false);
  const completedRef = useRef(false);
  const watchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstKeyRef = useRef(0);

  const liked = !!user && likes.includes(user.uid);
  const isOwnPost = user?.uid === post.uid;
  const isVideo = post.mediaType === "video" && !!post.videoUrl;
  const isImage = !isVideo && (post.attachments?.length ?? 0) > 0;
  const isPlayingVideo = isVideo && currentVideoId === post.id;
  const isFollowing = !!profile?.following?.includes(post.uid);

  // Claims/releases playback whenever this slide scrolls into/out of view, and runs the
  // 3-second-dwell view-count bump — same shape as FeedPostCard's own observer, threshold raised
  // to 0.75 since a full-viewport slide should be considered "current" only once it dominates
  // the screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) {
          if (isVideo) playVideo(post.id);
          if (!isOwnPost && !viewCountedRef.current) {
            viewCountedRef.current = true;
            incrementViewCount(post.id);
          }
        } else if (isVideo) {
          pauseVideo(post.id);
        }
      },
      { threshold: 0.75 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (isVideo) pauseVideo(post.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, isVideo, isOwnPost]);

  // Drives the actual <video> element and its watch-time/completion/replay tracking.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isPlayingVideo && inView) {
      videoEl.play().catch(() => {});
      watchTimer.current = setInterval(() => trackWatchTime(post.id, 5), 5000);
    } else {
      videoEl.pause();
      if (watchTimer.current) {
        clearInterval(watchTimer.current);
        watchTimer.current = null;
      }
    }
    return () => {
      if (watchTimer.current) {
        clearInterval(watchTimer.current);
        watchTimer.current = null;
      }
    };
  }, [isPlayingVideo, inView, post.id]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) videoEl.volume = volume;
  }, [volume]);

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (!completedRef.current && v.currentTime / v.duration >= 0.8) {
      completedRef.current = true;
      trackVideoCompleted(post.id);
    }
  }

  function handleVideoLooped() {
    // A loop is a "replay" once the viewer has already watched it through once this session.
    if (completedRef.current) trackVideoReplay(post.id);
  }

  async function handleLike() {
    if (!user || liking) return;
    setLiking(true);
    const wasLiked = liked;
    setLikes((prev) => (wasLiked ? prev.filter((id) => id !== user.uid) : [...prev, user.uid]));
    try {
      await likePost(user.uid, post.id, wasLiked);
    } catch {
      setLikes((prev) => (wasLiked ? [...prev, user.uid] : prev.filter((id) => id !== user.uid)));
    } finally {
      setLiking(false);
    }
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      burstKeyRef.current += 1;
      setLikeBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: burstKeyRef.current });
      setTimeout(() => setLikeBurst(null), 700);
      if (!liked) handleLike();
    } else {
      lastTapRef.current = now;
    }
  }

  async function handleToggleSave() {
    if (!user) {
      toast.error("Sign in to save posts.");
      return;
    }
    setSavingBookmark(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await savePost(user.uid, post);
      else await unsavePost(user.uid, post.id);
    } catch {
      setSaved(!next);
      toast.error("Couldn't update your saved posts.");
    } finally {
      setSavingBookmark(false);
    }
  }

  async function handleVisitProfile() {
    trackProfileVisit(post.id);
  }

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    try {
      await deletePost(user.uid, post.id);
      toast.success("Post deleted.");
      onDeleted(post.id);
    } catch {
      toast.error("Couldn't delete this post.");
      setDeleting(false);
    }
  }

  const profileHref = getUserProfileUrl({ uid: post.uid, isCreator: true, handle: post.handle });
  const gradient = brandGradientFor(post.uid + post.id);

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full shrink-0 snap-start overflow-hidden bg-black md:h-full md:rounded-2xl"
      onClick={handleContainerClick}
    >
      {/* ---------------------------- Media layer ---------------------------- */}
      {isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          src={post.videoUrl}
          poster={post.videoPosterUrl}
          className="absolute inset-0 h-full w-full object-contain"
          muted={effectiveMuted}
          loop
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoLooped}
        />
      ) : isImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.attachments![0]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        </>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-10"
          style={{ background: post.type === "milestone" ? gradient : `linear-gradient(160deg, ${stringToColor(post.uid)}, #0c0a08)` }}
        >
          <p className="text-center font-cinzel text-2xl leading-relaxed text-ivory drop-shadow-lg">
            {post.content}
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      {/* ---------------------------- Double-tap heart burst ---------------------------- */}
      {likeBurst && (
        <Heart
          key={likeBurst.key}
          className="like-burst pointer-events-none absolute h-24 w-24 fill-clay text-clay drop-shadow-2xl"
          style={{ left: likeBurst.x - 48, top: likeBurst.y - 48 }}
        />
      )}

      {/* ---------------------------- Bottom-left info ---------------------------- */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pb-6 sm:p-6">
        <div className="min-w-0 flex-1 text-ivory" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Link href={profileHref} onClick={handleVisitProfile} className="shrink-0">
              <Avatar uid={post.uid} photoURL={post.photoURL} displayName={post.displayName} size={36} className="border-2 border-white/80" />
            </Link>
            <Link href={profileHref} onClick={handleVisitProfile} className="flex min-w-0 items-center gap-1 font-syne text-sm font-semibold text-ivory">
              <span className="truncate">{post.displayName}</span>
              <VerifiedBadge profile={post} className="h-3.5 w-3.5" />
              <PlatinumBadge isPlatinum={post.isPlatinum} className="h-3.5 w-3.5" />
            </Link>
            <span className="shrink-0 font-noto text-xs text-ivory/60">· {formatPostTimestamp(post.createdAt)}</span>
            {!isOwnPost && !isFollowing && (
              <div className="shrink-0">
                <FollowButton targetUid={post.uid} hideCount />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCaptionExpanded((v) => !v)}
            className={`mt-2 max-w-[85vw] text-left font-noto text-sm text-ivory/95 sm:max-w-sm ${captionExpanded ? "" : "line-clamp-2"}`}
          >
            <MentionText text={post.content} />
          </button>

          {post.soundTitle && (
            <p className="mt-2 flex items-center gap-1.5 truncate font-noto text-xs text-ivory/80">
              🎵 {post.soundTitle} {post.soundArtist ? `— ${post.soundArtist}` : ""}
            </p>
          )}
        </div>

        {/* ---------------------------- Right action stack ---------------------------- */}
        <div className="flex shrink-0 flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={handleLike} disabled={!user} className="flex flex-col items-center gap-1">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/30 backdrop-blur ${liked ? "text-clay" : "text-white"}`}>
              <Heart className={`h-6 w-6 ${liked ? "fill-clay" : ""}`} />
            </span>
            <span className="font-syne text-[11px] font-semibold text-white drop-shadow">{likes.length}</span>
          </button>

          <button type="button" onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur">
              <MessageCircle className="h-6 w-6" />
            </span>
            <span className="font-syne text-[11px] font-semibold text-white drop-shadow">{post.commentCount}</span>
          </button>

          <button type="button" onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur">
              <Share2 className="h-6 w-6" />
            </span>
            <span className="font-syne text-[11px] font-semibold text-white drop-shadow">{post.shareCount ?? 0}</span>
          </button>

          <button type="button" onClick={handleToggleSave} disabled={savingBookmark} className="flex flex-col items-center gap-1">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/30 backdrop-blur ${saved ? "text-gold" : "text-white"}`}>
              <Bookmark className={`h-6 w-6 ${saved ? "fill-gold" : ""}`} />
            </span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur"
            >
              <MoreHorizontal className="h-6 w-6" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-xl bg-[#232323] p-1.5 shadow-2xl">
                  {isOwnPost ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setBoostOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-noto text-sm text-clay2 hover:bg-white/10"
                      >
                        <Sparkles className="h-4 w-4" /> Boost this post
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-noto text-sm text-clay2 hover:bg-white/10"
                      >
                        <Trash2 className="h-4 w-4" /> Delete post
                      </button>
                    </>
                  ) : (
                    <div className="px-1 py-1">
                      <ReportButton targetType="post" targetId={post.id} targetUserId={post.uid} label="Report post" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <FeedCommentSheet postId={post.id} postAuthorUid={post.uid} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <FeedShareSheet post={post} open={shareOpen} onClose={() => setShareOpen(false)} />
      <BoostModal open={boostOpen} onClose={() => setBoostOpen(false)} postId={post.id} onBoosted={() => {}} />
    </div>
  );
}

export default memo(TikTokFeedItem);
