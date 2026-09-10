"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  BadgeCheck,
  BookOpen,
  Eye,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Rocket,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import BoostModal from "./BoostModal";
import EditingAppBadge from "./EditingAppBadge";
import { Avatar } from "@/components/ui/Avatar";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { deletePost, incrementPostViews, incrementViewCount, likePost, trackWatchTime } from "@/lib/creatorFeed";
import { useAuth } from "@/hooks/useAuth";
import { useFeedAudio } from "@/lib/audioContext";
import { formatTime } from "@/lib/utils";
import ReportButton from "@/components/social/ReportButton";
import type { CreatorPost, CreatorPostType } from "@/types";

const SOUND_SOURCE_LABEL: Record<NonNullable<CreatorPost["soundSource"]>, string> = {
  library: "Library",
  creator: "Original Sound",
  spotify: "Spotify",
};

const TYPE_LABEL: Record<CreatorPostType, string> = {
  update: "Update",
  preview: "Chapter Preview",
  announcement: "Announcement",
  milestone: "Milestone 🏆",
};

const IMAGE_RES_LABEL: Partial<Record<NonNullable<CreatorPost["imageResolution"]>, string>> = {
  hd: "HD",
  "2k": "2K",
  "4k": "4K",
};

const VIDEO_RES_LABEL: Partial<Record<NonNullable<CreatorPost["videoResolution"]>, string>> = {
  "720p": "720p",
  "1080p": "1080p",
  "2k": "2K",
  "4k": "4K",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ImageGrid({ images, resLabel }: { images: string[]; resLabel?: string }) {
  if (images.length === 0) return null;
  const grid =
    images.length === 1 ? (
      <div className="mt-3 overflow-hidden rounded-xl border border-bg4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            loading="lazy" src={getOptimizedImageUrl(images[0], 800)} alt="" className="max-h-[420px] w-full object-cover" />
      </div>
    ) : (
      <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl border border-bg4">
        {images.slice(0, 4).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" key={src + i} src={getOptimizedImageUrl(src, 800)} alt="" className="aspect-square w-full object-cover" />
        ))}
      </div>
    );
  return (
    <div className="relative">
      {grid}
      {resLabel && (
        <span className="absolute right-4 top-4 rounded-full bg-black/70 px-2 py-0.5 font-noto text-[10px] font-semibold text-gold">
          {resLabel}
        </span>
      )}
    </div>
  );
}

export interface FeedPostCardProps {
  post: CreatorPost;
  /** Called after a successful delete so the parent list can drop this card locally. */
  onDeleted?: (postId: string) => void;
}

function FeedPostCard({ post, onDeleted }: FeedPostCardProps) {
  const { user } = useAuth();
  const { currentPostId, isMuted, play, pause, setMuted, currentVideoId, playVideo, pauseVideo } = useFeedAudio();
  const [likes, setLikes] = useState(post.likes);
  const [liking, setLiking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostLevel, setBoostLevel] = useState(post.boostLevel ?? 0);
  const [boostExpiresAt, setBoostExpiresAt] = useState(post.boostExpiresAt);
  const [videoProgress, setVideoProgress] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const liked = !!user && likes.includes(user.uid);
  const isOwnPost = user?.uid === post.uid;
  const isMilestone = post.type === "milestone";
  const isPreview = post.type === "preview";
  const isVideo = post.mediaType === "video" && !!post.videoUrl;
  const viewCounted = useRef(false);
  const watchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSound = !!post.soundUrl;
  const isPlayingThis = hasSound && currentPostId === post.id;
  const isPlayingVideo = isVideo && currentVideoId === post.id;
  const isBoosted = boostLevel > 0 && !!boostExpiresAt && new Date(boostExpiresAt).getTime() > Date.now();

  // Autoplay (muted) whenever this card scrolls into view; pause it again once it leaves —
  // this is what makes "only one post plays at a time" true without any card needing to know
  // about any other card, since a card only ever acts on its own visibility. Also runs the
  // 3-second-dwell view-count bump and starts/stops the watch-time accumulator for video.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (post.soundUrl) play(post.soundUrl, post.id);
          if (isVideo) playVideo(post.id);
          if (!isOwnPost && !viewCounted.current && !viewTimer.current) {
            viewTimer.current = setTimeout(() => {
              viewCounted.current = true;
              incrementPostViews(post.id);
              incrementViewCount(post.id);
            }, 3000);
          }
        } else {
          if (post.soundUrl) pause(post.id);
          if (isVideo) pauseVideo(post.id);
          if (viewTimer.current) {
            clearTimeout(viewTimer.current);
            viewTimer.current = null;
          }
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (post.soundUrl) pause(post.id);
      if (isVideo) pauseVideo(post.id);
      if (viewTimer.current) clearTimeout(viewTimer.current);
    };
    // play/pause/playVideo/pauseVideo are referentially stable (see lib/audioContext.ts), so
    // this only ever re-subscribes when the post itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.soundUrl, post.id, isVideo, isOwnPost]);

  // Drives the actual <video> element's play/pause from the context's arbitration, and
  // accumulates watch time in 5-second buckets while genuinely playing.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isPlayingVideo) {
      videoEl.play().catch(() => {});
      watchTimer.current = setInterval(() => {
        trackWatchTime(post.id, 5);
      }, 5000);
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
  }, [isPlayingVideo, post.id]);

  function handleToggleMute() {
    if (!post.soundUrl) return;
    if (!isPlayingThis) {
      play(post.soundUrl, post.id);
      setMuted(false);
    } else {
      setMuted(!isMuted);
    }
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
      toast.error("Couldn't update your like. Please try again.");
    } finally {
      setLiking(false);
    }
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/feed#${post.id}` : "";
    const shareData = { title: `${post.displayName} on ÍléOtaku`, text: post.content, url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled the share sheet — not an error.
      }
    } else if (url) {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  }

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    try {
      await deletePost(user.uid, post.id);
      toast.success("Post deleted.");
      onDeleted?.(post.id);
    } catch {
      toast.error("Couldn't delete this post.");
      setDeleting(false);
    }
  }

  const imageResLabel = post.imageResolution ? IMAGE_RES_LABEL[post.imageResolution] : undefined;
  const videoResLabel = post.videoResolution ? VIDEO_RES_LABEL[post.videoResolution] : undefined;

  return (
    <div
      id={post.id}
      ref={cardRef}
      className={`relative rounded-2xl border bg-bg2 p-5 ${
        isMilestone
          ? "border-2 border-gold shadow-[0_0_24px_-8px_rgba(212,169,90,0.4)]"
          : isBoosted
            ? "border-clay/60"
            : "border-bg4"
      }`}
    >
      {isBoosted && (
        <span className="absolute -top-2 left-5 flex items-center gap-1 rounded-full bg-clay px-2.5 py-0.5 font-syne text-[10px] font-bold uppercase tracking-wide text-ivory">
          <Rocket className="h-3 w-3" /> Promoted
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar uid={post.uid} photoURL={post.photoURL} displayName={post.displayName} size={40} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-syne text-sm font-semibold text-text">{post.displayName}</span>
              {post.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-plat" aria-label="Verified" />}
              {post.isFoundingCreator && (
                <span className="badge-plat">
                  <Sparkles className="h-3 w-3" /> Founding
                </span>
              )}
              {post.isPlatinum && <span className="badge-plat">Platinum</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-noto text-xs text-muted">
              <span className="rounded-full bg-bg3 px-2 py-0.5 text-[11px] font-semibold text-clay2">
                {TYPE_LABEL[post.type]}
              </span>
              <span>· {formatTime(post.createdAt)}</span>
              {post.viewCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Eye className="h-3 w-3" /> {post.viewCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {hasSound && (
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isPlayingThis && !isMuted ? "Mute sound" : "Unmute sound"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-clay2"
            >
              {isPlayingThis && !isMuted ? (
                <Volume2 className="h-4 w-4 text-clay2" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Post options"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-text"
            >
              <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-10 w-44 overflow-hidden rounded-xl border border-bg4 bg-bg2 p-1 shadow-xl">
              {isOwnPost ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setBoostOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-clay2 hover:bg-bg3"
                  >
                    <Rocket className="h-3.5 w-3.5" /> Boost this post
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-clay2 hover:bg-bg3"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete post
                  </button>
                </>
              ) : (
                <div className="px-1 py-1">
                  <ReportButton targetType="post" targetId={post.id} targetUserId={post.uid} label="Report post" />
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {isPreview && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-clay/40 bg-clay/5 p-3">
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-bg3">
            <BookOpen className="h-5 w-5 text-muted" />
          </div>
          <div>
            <span className="badge-plat">New Chapter</span>
            <p className="mt-1 font-noto text-xs text-muted">A fresh chapter preview from this creator.</p>
          </div>
        </div>
      )}

      <p
        className={`whitespace-pre-wrap font-noto ${
          isMilestone ? "mt-4 text-base text-text" : "mt-3 text-sm text-text/90"
        }`}
      >
        {isMilestone && <Trophy className="mr-1.5 inline h-4 w-4 text-gold" />}
        {post.content}
      </p>

      {isVideo ? (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-bg4 bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={post.videoUrl}
            poster={post.videoPosterUrl}
            className="max-h-[480px] w-full object-contain"
            muted
            loop
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div className="h-full bg-clay transition-[width]" style={{ width: `${videoProgress}%` }} />
          </div>
          <div className="absolute left-2 top-2 flex items-center gap-1.5">
            {videoResLabel && (
              <span className="rounded-full bg-black/70 px-2 py-0.5 font-noto text-[10px] font-semibold text-gold">
                {videoResLabel}
              </span>
            )}
            <EditingAppBadge app={post.editingApp} />
          </div>
          {post.videoDuration !== undefined && post.videoDuration > 0 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 font-noto text-[10px] font-semibold text-ivory">
              {formatDuration(post.videoDuration)}
            </span>
          )}
        </div>
      ) : (
        <ImageGrid images={post.attachments ?? []} resLabel={imageResLabel} />
      )}

      <div className="mt-4 flex items-center gap-5 border-t border-bg4 pt-3">
        <button
          type="button"
          onClick={handleLike}
          disabled={!user || liking}
          className={`flex items-center gap-1.5 font-noto text-sm transition-colors ${
            liked ? "text-clay2" : "text-muted hover:text-clay2"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-clay text-clay2" : ""}`} />
          {likes.length}
        </button>
        <span className="flex items-center gap-1.5 font-noto text-sm text-muted">
          <MessageCircle className="h-4 w-4" /> {post.commentCount}
        </span>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 font-noto text-sm text-muted transition-colors hover:text-clay2"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
        {!isOwnPost && post.handle && (
          <Link href={`/creator/${post.handle}`} className="ml-auto font-noto text-xs text-muted hover:text-gold">
            View creator
          </Link>
        )}
      </div>

      {isPlayingThis && !isMuted && post.soundTitle && (
        <div className="sound-marquee mt-3 rounded-full bg-bg3 px-3 py-1.5">
          <span className="sound-marquee-track font-noto text-xs text-clay2">
            {(() => {
              const label = `🎵 ${post.soundTitle} — ${post.soundArtist ?? "Unknown"} · ${
                SOUND_SOURCE_LABEL[post.soundSource ?? "library"]
              }`;
              // Two copies with a gap between, since the -50% scroll keyframe assumes exactly
              // half the track is one full loop of the label.
              return `${label}        ${label}        `;
            })()}
          </span>
        </div>
      )}

      <BoostModal
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        postId={post.id}
        onBoosted={(level, expiresAt) => {
          setBoostLevel(level);
          setBoostExpiresAt(expiresAt);
        }}
      />
    </div>
  );
}

export default memo(FeedPostCard);
