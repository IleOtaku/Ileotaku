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
const VOLUME_KEY = "ileotaku-feed-audio-volume";

export interface FeedAudioContextValue {
  /** postId of whichever FeedPostCard is currently the one playing (or would be playing, if
   * not for autoplay-blocking) — null when nothing is active. */
  currentPostId: string | null;
  /** The reader's chosen mute preference, persisted in localStorage — defaults to false (sound
   * ON), per the TikTok Feed Overhaul spec. Doesn't by itself mean audio is actually audible yet
   * this session — see `soundReady`. */
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
  /** 0-1, persisted in localStorage — the desktop hover-slider and mobile long-press volume
   * control both write through this. */
  volume: number;
  setVolume: (volume: number) => void;
  /** True once the page has seen its first user gesture (pointerdown/touchstart/keydown) this
   * session — browsers block audible autoplay until then, so every video/audio element must stay
   * force-muted while this is false regardless of `isMuted`. Flips true automatically and stays
   * true for the rest of the session once it does. */
  soundReady: boolean;
  /** What a video element's `muted` prop should actually be right now — `isMuted || !soundReady`,
   * computed once here so every card doesn't repeat the same expression. */
  effectiveMuted: boolean;

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
 *
 * TikTok Feed Overhaul: sound now defaults ON (`isMuted` starts false) rather than muted-by-
 * default — every video/audio element still has to start technically muted to satisfy browser
 * autoplay policy, so `soundReady` tracks whether this session has seen a user gesture yet, and
 * `effectiveMuted` (`isMuted || !soundReady`) is what callers should actually bind to a media
 * element's `muted` prop. The instant the first tap/click/key happens anywhere on the page,
 * `soundReady` flips true and every currently-playing video/sound becomes audible.
 */
export function FeedAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPostIdRef = useRef<string | null>(null);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);
  const [isMuted, setIsMutedState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [soundReady, setSoundReady] = useState(false);

  const currentVideoIdRef = useRef<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    let storedMuted = false;
    let storedVolume = 1;
    try {
      const stored = localStorage.getItem(MUTE_KEY);
      if (stored !== null) storedMuted = stored === "true";
      const storedVol = localStorage.getItem(VOLUME_KEY);
      if (storedVol !== null) storedVolume = Math.min(1, Math.max(0, Number(storedVol)));
    } catch {
      // Storage unavailable — fall back to the defaults above.
    }
    // Always start the underlying element muted regardless of preference — soundReady (below)
    // unmutes it the instant a real user gesture makes that safe.
    audio.muted = true;
    audio.volume = storedVolume;
    setIsMutedState(storedMuted);
    setVolumeState(storedVolume);
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

  // Unlocks audible playback on the first real user gesture anywhere on the page — required
  // because browsers only allow autoplay-with-sound after user activation, but a TikTok-style
  // feed needs to *try* playing sound the moment a post scrolls into view, before that gesture
  // has necessarily happened yet.
  useEffect(() => {
    if (soundReady) return;
    function unlock() {
      setSoundReady(true);
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundReady]);

  // Applies the real muted state to the shared <audio> element whenever either half of
  // `effectiveMuted` changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted || !soundReady;
  }, [isMuted, soundReady]);

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
    setIsMutedState(muted);
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // Non-fatal — the mute preference just won't persist across sessions.
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // Non-fatal.
    }
  }, []);

  const effectiveMuted = isMuted || !soundReady;

  const value = useMemo<FeedAudioContextValue>(
    () => ({
      currentPostId,
      isMuted,
      play,
      pause,
      toggle,
      setMuted,
      volume,
      setVolume,
      soundReady,
      effectiveMuted,
      currentVideoId,
      playVideo,
      pauseVideo,
    }),
    [
      currentPostId,
      isMuted,
      play,
      pause,
      toggle,
      setMuted,
      volume,
      setVolume,
      soundReady,
      effectiveMuted,
      currentVideoId,
      playVideo,
      pauseVideo,
    ]
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
