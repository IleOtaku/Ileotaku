"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MUTE_KEY = "ileotaku-feed-audio-muted";

export interface FeedAudioContextValue {
  /** postId of whichever FeedPostCard is currently the one playing (or would be playing, if
   * not for autoplay-blocking) — null when nothing is active. */
  currentPostId: string | null;
  /** Global mute state, persisted in localStorage — starts true so autoplay-on-scroll-into-view
   * is always allowed by the browser without a user gesture. */
  isMuted: boolean;
  /** Starts playing `url` for `postId`, superseding whatever was playing before — there is only
   * ever one underlying <audio> element, so starting a new post's sound implicitly stops the
   * previous one. Also stops any playing video, so the feed only ever has one media source
   * making sound at a time. */
  play: (url: string, postId: string) => void;
  /** Pauses playback. If `postId` is given, only pauses when that post is the one actually
   * playing — lets a post card that's scrolling out of view stop playback safely without racing
   * against a different post that has since taken over. */
  pause: (postId?: string) => void;
  /** Play if nothing (or a different post) is playing; pause if this exact post is already
   * playing. */
  toggle: (url: string, postId: string) => void;
  setMuted: (muted: boolean) => void;

  /* ------------------------- Sprint 9b: video coordination ------------------------- */

  /** postId of whichever video card currently "owns" playback — a video card compares this to
   * its own post id to decide whether to actually play its <video> element. This context does
   * not own a shared <video> element the way it owns the single <audio> element (each card
   * needs its own, for independent poster frames / scroll position / progress bars); it only
   * arbitrates *which one* is allowed to play at once, the same way `currentPostId` does for
   * sound. */
  currentVideoId: string | null;
  /** Claims video playback for `postId` — stops any currently-playing sound clip too, so a video
   * scrolling into view silences a sound post that was already playing. */
  playVideo: (postId: string) => void;
  /** Releases video playback. If `postId` is given, only releases when that video is the one
   * actually playing (same guard as `pause`). */
  pauseVideo: (postId?: string) => void;
}

const FeedAudioContext = createContext<FeedAudioContextValue | null>(null);

/**
 * Owns the single HTML `Audio` instance shared by every FeedPostCard on the page — mounted once
 * at the root layout so it survives client-side navigation between pages that render post cards
 * (feed, home, creator profiles). `play`/`pause`/`toggle` are referentially stable (no state in
 * their dependency arrays) so a card's IntersectionObserver effect never has to re-subscribe
 * just because a *different* card started or stopped playing.
 */
export function FeedAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPostIdRef = useRef<string | null>(null);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);
  const [isMuted, setIsMutedState] = useState(true);

  const currentVideoIdRef = useRef<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    let storedMuted = true;
    try {
      const stored = localStorage.getItem(MUTE_KEY);
      if (stored !== null) storedMuted = stored === "true";
    } catch {
      // Storage unavailable — fall back to muted-by-default.
    }
    audio.muted = storedMuted;
    setIsMutedState(storedMuted);
    audioRef.current = audio;

    function handleEnded() {
      currentPostIdRef.current = null;
      setCurrentPostId(null);
    }
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const pauseVideo = useCallback((postId?: string) => {
    if (postId && currentVideoIdRef.current !== postId) return;
    currentVideoIdRef.current = null;
    setCurrentVideoId(null);
  }, []);

  const play = useCallback(
    (url: string, postId: string) => {
      const audio = audioRef.current;
      if (!audio || !url) return;
      pauseVideo();
      if (currentPostIdRef.current !== postId || !audio.src.endsWith(url)) {
        audio.src = url;
        audio.currentTime = 0;
      }
      audio.play().catch(() => {
        // Autoplay can still be blocked in some browsers/contexts even while muted — silently
        // no-op rather than surface an error for something the user didn't explicitly trigger.
      });
      currentPostIdRef.current = postId;
      setCurrentPostId(postId);
    },
    [pauseVideo]
  );

  const pause = useCallback((postId?: string) => {
    if (postId && currentPostIdRef.current !== postId) return;
    audioRef.current?.pause();
    currentPostIdRef.current = null;
    setCurrentPostId(null);
  }, []);

  const toggle = useCallback(
    (url: string, postId: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (currentPostIdRef.current === postId && !audio.paused) {
        pause(postId);
      } else {
        play(url, postId);
      }
    },
    [play, pause]
  );

  const playVideo = useCallback(
    (postId: string) => {
      pause();
      currentVideoIdRef.current = postId;
      setCurrentVideoId(postId);
    },
    [pause]
  );

  const setMuted = useCallback((muted: boolean) => {
    if (audioRef.current) audioRef.current.muted = muted;
    setIsMutedState(muted);
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // Non-fatal — the mute preference just won't persist across sessions.
    }
  }, []);

  const value = useMemo<FeedAudioContextValue>(
    () => ({
      currentPostId,
      isMuted,
      play,
      pause,
      toggle,
      setMuted,
      currentVideoId,
      playVideo,
      pauseVideo,
    }),
    [currentPostId, isMuted, play, pause, toggle, setMuted, currentVideoId, playVideo, pauseVideo]
  );

  return createElement(FeedAudioContext.Provider, { value }, children);
}

export function useFeedAudio(): FeedAudioContextValue {
  const ctx = useContext(FeedAudioContext);
  if (!ctx) {
    throw new Error("useFeedAudio must be called within a FeedAudioProvider");
  }
  return ctx;
}
