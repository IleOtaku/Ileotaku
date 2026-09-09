"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, LogOut, Users } from "lucide-react";
import { SpotifyGlyph } from "./NowPlayingCard";
import { leaveListenSession, subscribeToListenSession, subscribeToNowPlaying } from "@/lib/nowPlaying";
import type { ListenSession, NowPlaying } from "@/types";

export interface ListenAlongPanelProps {
  hostUid: string;
  /** Handle or display name, already resolved by the caller — this panel never fetches the
   * host's profile itself, since NowPlayingCard already has it in hand. */
  hostHandle: string;
  listenerUid: string;
  onClose: () => void;
}

/** Fixed-right slide-in panel opened from NowPlayingCard's "Listen Along" button. Plays the
 * host's current track's 30-second preview locally (Spotify's public API has no way to hand a
 * third party the actual playback stream — a real synced-listening session needs Spotify
 * Premium and their own SDK, which is exactly what the "Full sync requires..." note below is
 * honest about) and mirrors the host's real progress bar and the live listener roster. */
export default function ListenAlongPanel({ hostUid, hostHandle, listenerUid, onClose }: ListenAlongPanelProps) {
  const [session, setSession] = useState<ListenSession | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const leftRef = useRef(false);

  useEffect(() => subscribeToListenSession(hostUid, setSession), [hostUid]);
  useEffect(() => subscribeToNowPlaying(hostUid, setNowPlaying), [hostUid]);

  // Play the preview once, on open.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    if (session?.previewUrl) {
      audio.src = session.previewUrl;
      audio.play().catch(() => {
        // Autoplay can be blocked without a user gesture — the panel still shows the synced
        // progress bar even if local audio doesn't start automatically.
      });
    }
    return () => {
      audio.pause();
      audio.src = "";
    };
    // Only ever want this to run once per session's previewUrl, not on every roster update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.previewUrl]);

  // Mirror the host's real progress locally between their own 30s sync ticks, same approach as
  // NowPlayingCard's full mode.
  useEffect(() => {
    if (!nowPlaying?.isPlaying || nowPlaying.durationMs === undefined) return;
    setDisplayProgress(nowPlaying.progressMs ?? 0);
    const interval = setInterval(() => {
      setDisplayProgress((p) => Math.min(nowPlaying.durationMs ?? p, p + 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.isPlaying, nowPlaying?.progressMs, nowPlaying?.durationMs]);

  const leave = useRef(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    audioRef.current?.pause();
    await leaveListenSession(hostUid, listenerUid);
    onClose();
  });

  // Auto-close the moment the host stops playing — a stale "Listen Along" session for a track
  // that's no longer playing would just be confusing.
  useEffect(() => {
    if (nowPlaying && !nowPlaying.isPlaying) {
      leave.current();
    }
  }, [nowPlaying]);

  // Deliberately NOT also calling leaveListenSession() from a plain mount-effect cleanup here.
  // listenAlong() (the "join") is called by the *parent* (NowPlayingCard) before this panel
  // ever mounts, so a cleanup tied to this component's own mount/unmount lifecycle fires at the
  // wrong time relative to that join — confirmed live in dev: React 18 Strict Mode's
  // mount→unmount→remount double-invoke ran this cleanup immediately after joining, silently
  // removing the listener from `listeners` a moment after they'd been added, before the user
  // did anything. Leaving is instead handled only by the two real "the user is actually gone"
  // signals below: the explicit Leave button and the host-stopped-playing auto-close — both
  // already guard via `leftRef` so leave() only ever runs once either way. A parent that stops
  // rendering this panel for some other reason (e.g. navigating away) leaves a listener entry
  // that self-corrects next time anyone reads the session against the host's own `isPlaying`
  // state, which is an acceptable trade-off against the alternative (leaving immediately after
  // joining, defeating the feature outright).

  const trackName = nowPlaying?.trackName ?? session?.trackName ?? "";
  const artistName = nowPlaying?.artistName ?? "";
  const albumArt = nowPlaying?.albumArt;
  const trackUrl = nowPlaying?.trackUrl;
  const otherListeners = Math.max(0, (session?.listeners.length ?? 1) - 1);
  const pct =
    nowPlaying?.durationMs && nowPlaying.durationMs > 0
      ? Math.min(100, (displayProgress / nowPlaying.durationMs) * 100)
      : 0;

  return (
    <div className="fixed inset-y-0 right-0 z-[110] flex w-full max-w-sm flex-col border-l border-bg4 bg-bg2 shadow-2xl">
      <div className="flex items-center justify-between border-b border-bg4 p-4">
        <div className="flex items-center gap-2">
          <SpotifyGlyph className="h-5 w-5" />
          <h2 className="font-syne text-sm font-semibold text-text">Listening with @{hostHandle}</h2>
        </div>
        <button
          type="button"
          onClick={() => leave.current()}
          aria-label="Close"
          className="text-muted hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6 text-center">
        {albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" src={albumArt} alt="" className="h-[120px] w-[120px] rounded-2xl object-cover shadow-lg" />
        ) : (
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-2xl bg-bg3">
            <SpotifyGlyph className="h-10 w-10" />
          </div>
        )}

        <div>
          <p className="font-syne text-base font-semibold text-text">{trackName || "Waiting for track..."}</p>
          <p className="mt-1 font-noto text-sm text-muted">{artistName}</p>
        </div>

        <div className="w-full">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg4">
            <div className="h-full rounded-full bg-green-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="flex items-center gap-1.5 font-noto text-xs text-muted">
          <Users className="h-3.5 w-3.5" />
          {otherListeners > 0 ? `You + ${otherListeners} other${otherListeners === 1 ? "" : "s"} listening` : "You're listening"}
        </p>

        {trackUrl && (
          <a
            href={trackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm"
          >
            <ExternalLink className="h-4 w-4" /> Open full track in Spotify
          </a>
        )}

        <p className="mt-2 font-noto text-[11px] text-muted">Full sync requires Spotify Premium.</p>
      </div>

      <div className="border-t border-bg4 p-4">
        <button type="button" onClick={() => leave.current()} className="btn-ghost w-full justify-center text-sm">
          <LogOut className="h-4 w-4" /> Leave
        </button>
      </div>
    </div>
  );
}
