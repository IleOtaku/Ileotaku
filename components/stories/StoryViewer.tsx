"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { sendDM, startConversation } from "@/lib/dms";
import { getUserProfile } from "@/lib/firestore";
import { deleteStory, subscribeToStoryViews, viewStory } from "@/lib/stories";
import { formatTime } from "@/lib/utils";
import type { Story, UserProfile } from "@/types";

export interface StoryViewerProps {
  /** Every uid with at least one active story, in display order — tapping right past the last
   * story of one person advances to the next person's; past the very last, the viewer closes. */
  uids: string[];
  startUid: string;
  storiesByUid: Map<string, Story[]>;
  onClose: () => void;
  /** Only used when opening your OWN circle with zero stories — StoriesBar routes that straight
   * to the create modal instead, so this only ever fires from within an already-open viewer. */
  onAddYourOwn: () => void;
}

const DEFAULT_SEGMENT_MS = 5000;

/** Full-screen story viewer: per-segment progress bars, tap left/right or hold-to-pause, swipe
 * down (mobile) to close, a reply box that sends a DM to the story's author, and — on your own
 * story — a live view count with a tap-to-expand viewers list. */
export default function StoryViewer({ uids, startUid, storiesByUid, onClose, onAddYourOwn }: StoryViewerProps) {
  const { user, profile } = useAuth();
  const [personIndex, setPersonIndex] = useState(() => Math.max(0, uids.indexOf(startUid)));
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Brief "⏸" flash whenever a pause starts (hover, touch-hold, or focusing the reply input) —
  // shown for a moment then faded, rather than staying on screen for the whole pause, so it
  // reads as an acknowledgement rather than a persistent status icon.
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const pauseIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewedBy, setViewedBy] = useState<string[]>([]);
  const [viewerProfiles, setViewerProfiles] = useState<Map<string, UserProfile>>(new Map());
  const touchStartY = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Video segments track their own progress off the real <video> element's currentTime/duration
  // (via onTimeUpdate/onLoadedMetadata below) rather than the rAF wall-clock timer every other
  // segment type uses — that timer used to run against `segmentDuration: undefined` for video,
  // which the rAF effect below just skips entirely, so a video's progress bar never filled.
  const [videoProgress, setVideoProgress] = useState(0);
  const [muted, setMuted] = useState(false);

  const uid = uids[personIndex];
  const stories = storiesByUid.get(uid) ?? [];
  const story = stories[segmentIndex];
  const isOwn = uid === user?.uid;
  const isVideo = story?.mediaType === "video";
  const segmentDuration = isVideo ? undefined : (story?.duration ?? DEFAULT_SEGMENT_MS);

  useEffect(() => {
    setSegmentIndex(0);
    setElapsed(0);
    setVideoProgress(0);
  }, [personIndex]);

  useEffect(() => {
    setElapsed(0);
    setVideoProgress(0);
  }, [segmentIndex]);

  // Hover/hold-to-pause must actually pause video playback too, not just freeze a JS timer —
  // otherwise the video keeps playing (and its sound keeps going) underneath the "⏸" overlay.
  useEffect(() => {
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (paused) el.pause();
    else el.play().catch(() => {});
  }, [paused, isVideo, segmentIndex, personIndex]);

  // Marks the current segment viewed once, when it first becomes the active one.
  useEffect(() => {
    if (!user || !story) return;
    viewStory(story.id, user.uid);
  }, [story, user]);

  // Live view count/list — only actually rendered for the author, but harmless to keep
  // subscribed for whichever segment is current regardless.
  useEffect(() => {
    if (!story) return;
    return subscribeToStoryViews(story.id, setViewedBy);
  }, [story]);

  function goNextSegment() {
    if (segmentIndex < stories.length - 1) {
      setSegmentIndex((i) => i + 1);
    } else if (personIndex < uids.length - 1) {
      setPersonIndex((i) => i + 1);
    } else {
      onClose();
    }
  }

  function goPrevSegment() {
    if (segmentIndex > 0) {
      setSegmentIndex((i) => i - 1);
    } else if (personIndex > 0) {
      setPersonIndex((i) => i - 1);
      setSegmentIndex(0);
    }
  }

  // Segment auto-advance timer — a plain rAF loop rather than setInterval so `paused` can just
  // stop scheduling the next frame instead of needing clearInterval/setInterval juggling.
  useEffect(() => {
    if (paused || !segmentDuration || viewersOpen) return;
    lastTickRef.current = performance.now();

    function tick(now: number) {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      setElapsed((e) => {
        const next = e + delta;
        if (next >= segmentDuration!) {
          goNextSegment();
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, segmentIndex, personIndex, segmentDuration, viewersOpen]);

  /** Pauses the story and flashes the "⏸" indicator for a moment. Safe to call repeatedly while
   * still hovering/holding — each call just restarts the fade timer. */
  function pause() {
    setPaused(true);
    setShowPauseIcon(true);
    if (pauseIconTimerRef.current) clearTimeout(pauseIconTimerRef.current);
    pauseIconTimerRef.current = setTimeout(() => setShowPauseIcon(false), 700);
  }
  function resume() {
    setPaused(false);
  }

  useEffect(() => {
    return () => {
      if (pauseIconTimerRef.current) clearTimeout(pauseIconTimerRef.current);
    };
  }, []);

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const tapX = e.clientX - left;
    if (tapX < width / 3) goPrevSegment();
    else goNextSegment();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    pause();
  }
  function handleTouchEnd(e: React.TouchEvent) {
    resume();
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy > 80) onClose();
  }

  async function handleSendReply() {
    if (!user || !profile || !reply.trim() || !story) return;
    setSendingReply(true);
    try {
      const convoId = await startConversation(user.uid, story.uid);
      await sendDM(convoId, user.uid, `Replied to your story: ${reply.trim()}`);
      toast.success("Reply sent!");
      setReply("");
    } catch {
      toast.error("Couldn't send your reply.");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleDeleteStory() {
    if (!user || !story || !isOwn) return;
    try {
      await deleteStory(story.id, user.uid);
      toast.success("Story deleted.");
      if (stories.length <= 1) onClose();
      else goNextSegment();
    } catch {
      toast.error("Couldn't delete this story.");
    }
  }

  async function handleShare() {
    if (!story) return;
    const url = `${window.location.origin}/profile/${story.uid}`;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: `${story.displayName}'s story` });
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copied.");
    }
  }

  const uniqueViewerCount = useMemo(() => viewedBy.filter((v) => v !== uid).length, [viewedBy, uid]);

  // Resolves display names/photos for the viewers list — only fetched for uids not already
  // resolved, and only once the list is actually opened, since most viewers never open it.
  useEffect(() => {
    if (!viewersOpen) return;
    const missing = viewedBy.filter((v) => v !== uid && !viewerProfiles.has(v));
    if (missing.length === 0) return;
    Promise.all(missing.map((v) => getUserProfile(v).then((p) => [v, p] as const))).then((entries) => {
      setViewerProfiles((prev) => {
        const next = new Map(prev);
        for (const [v, p] of entries) if (p) next.set(v, p);
        return next;
      });
    });
  }, [viewersOpen, viewedBy, uid, viewerProfiles]);

  if (!story) {
    if (isOwn) {
      onAddYourOwn();
      return null;
    }
    onClose();
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <div
        className="relative flex h-full w-full max-w-md flex-col"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onMouseDown={pause}
        onMouseUp={resume}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-x-2 top-2 z-10 flex gap-1">
          {stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{
                  // Driven by `elapsed`, which the rAF loop below stops advancing the instant
                  // `paused` is true — the same practical effect as `animation-play-state:
                  // paused` on a CSS-keyframe bar, without needing this segment's whole-duration
                  // width to be expressed as a restartable CSS animation.
                  width:
                    i < segmentIndex
                      ? "100%"
                      : i === segmentIndex
                        ? `${isVideo ? videoProgress : Math.min(100, (elapsed / (segmentDuration ?? 1)) * 100)}%`
                        : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Brief paused indicator — fades in on any pause, then fades itself out after ~700ms
            (see pause()) regardless of whether the pause itself is still active. */}
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300"
          style={{ opacity: showPauseIcon ? 1 : 0 }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-2xl text-white backdrop-blur-sm">
            ⏸
          </span>
        </div>

        <div className="absolute inset-x-0 top-6 z-10 flex items-center gap-2 px-3">
          <Avatar uid={story.uid} photoURL={story.photoURL} displayName={story.displayName} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-syne text-sm font-semibold text-white">{story.displayName}</p>
            <p className="font-noto text-[11px] text-white/70">{formatTime(story.createdAt)}</p>
          </div>
          {isOwn && (
            <button type="button" onClick={handleDeleteStory} aria-label="Delete story" className="text-white/80 hover:text-white">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div onClick={handleTap} className="relative flex-1 cursor-pointer">
          {story.mediaType === "text" ? (
            <div
              className="flex h-full w-full items-center justify-center p-8"
              style={{ background: story.backgroundColor || "#1a1510" }}
            >
              <p className="text-center font-cinzel text-2xl text-white">{story.textContent}</p>
            </div>
          ) : story.mediaType === "video" ? (
            <>
              <video
                ref={videoRef}
                src={story.mediaUrl}
                autoPlay
                muted={muted}
                playsInline
                className="h-full w-full object-contain"
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  setVideoProgress(el.duration > 0 ? Math.min(100, (el.currentTime / el.duration) * 100) : 0);
                }}
                onEnded={goNextSegment}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.mediaUrl} alt="" className="h-full w-full object-contain" />
          )}
        </div>

        {isOwn ? (
          <button
            type="button"
            onClick={() => setViewersOpen((o) => !o)}
            className="flex items-center gap-1.5 p-3 font-noto text-xs text-white/80"
          >
            <Eye className="h-4 w-4" /> {uniqueViewerCount} view{uniqueViewerCount === 1 ? "" : "s"}
          </button>
        ) : (
          <div className="flex items-center gap-2 p-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={pause}
              onBlur={resume}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendReply();
              }}
              placeholder="Reply..."
              className="flex-1 rounded-full border border-white/30 bg-black/40 px-4 py-2 font-noto text-sm text-white placeholder:text-white/50 focus:outline-none"
            />
            <button type="button" onClick={handleSendReply} disabled={!reply.trim() || sendingReply} aria-label="Send reply" className="text-white disabled:opacity-40">
              <Send className="h-5 w-5" />
            </button>
            <button type="button" onClick={handleShare} className="font-noto text-xs text-white/80 underline">
              Share
            </button>
          </div>
        )}

        {isOwn && viewersOpen && (
          <div className="max-h-48 overflow-y-auto border-t border-white/10 bg-black/80 p-3">
            {viewedBy.filter((v) => v !== uid).length === 0 ? (
              <p className="text-center font-noto text-xs text-white/60">No views yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {viewedBy
                  .filter((v) => v !== uid)
                  .map((viewerUid) => {
                    const p = viewerProfiles.get(viewerUid);
                    return (
                      <div key={viewerUid} className="flex items-center gap-2">
                        <Avatar uid={viewerUid} photoURL={p?.photoURL} displayName={p?.displayName ?? "Reader"} size={24} />
                        <span className="font-noto text-xs text-white/80">{p?.displayName ?? "Reader"}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
