"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Radio } from "lucide-react";
import ListenAlongPanel from "./ListenAlongPanel";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { listenAlong, startNowPlayingSync, subscribeToNowPlaying } from "@/lib/nowPlaying";
import { formatTime } from "@/lib/utils";
import type { NowPlaying, UserProfile } from "@/types";

/** Small brand-ish glyph (a plain circle + three curved bars) rather than pulling in an actual
 * Spotify logo asset — this codebase has no image/icon-asset pipeline for third-party brand
 * marks, and lucide-react doesn't ship one. */
export function SpotifyGlyph({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1DB954" />
      <path
        d="M6.5 9.5c3-1 8-1 11 .8M7 13c2.5-.8 6.5-.7 9 .8M7.5 16.2c2-.6 5-.5 7 .6"
        stroke="#0b0b0b"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EqualizerBars({ playing }: { playing: boolean }) {
  if (!playing) return null;
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      <span className="eq-bar" style={{ animationDelay: "0ms" }} />
      <span className="eq-bar" style={{ animationDelay: "180ms" }} />
      <span className="eq-bar" style={{ animationDelay: "360ms" }} />
    </span>
  );
}

/** The small "🎧 Track · Artist [eq]" row shared by NowPlayingCard's compact mode and
 * SpotifyMiniPlayer (which fetches its own data once rather than subscribing — see that
 * component — but renders the exact same markup so a DM header and a profile popover trigger
 * look identical). */
export function CompactNowPlayingRow({
  data,
  onClick,
}: {
  data: NowPlaying;
  onClick?: () => void;
}) {
  const label = data.isPlaying
    ? `${data.trackName} · ${data.artistName}`
    : data.lastTrackName
      ? `${data.lastTrackName} · ${data.lastArtistName}`
      : "Not playing anything";

  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-1.5 font-noto text-xs text-muted ${onClick ? "hover:text-text" : ""}`}
    >
      <SpotifyGlyph />
      <span className="min-w-0 truncate">{label}</span>
      <EqualizerBars playing={data.isPlaying} />
    </Wrapper>
  );
}

export interface NowPlayingCardProps {
  uid: string;
  compact?: boolean;
}

/** Now Playing display for a profile (full mode) or a compact inline row that expands into a
 * popover of the full card (DMs/comments use the lighter SpotifyMiniPlayer instead, which never
 * loads this component at all — see that file). Renders nothing if the target user hasn't
 * connected Spotify or has opted out via `showNowPlaying`. */
export default function NowPlayingCard({ uid, compact = false }: NowPlayingCardProps) {
  const { user: viewer } = useAuth();
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [data, setData] = useState<NowPlaying | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserProfile(uid).then((p) => {
      if (!cancelled) setTargetProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    const unsub = subscribeToNowPlaying(uid, setData);
    return unsub;
  }, [uid]);

  // Own-profile viewers keep their Now Playing doc fresh for everyone else's listeners.
  useEffect(() => {
    if (!viewer || viewer.uid !== uid) return;
    return startNowPlayingSync(uid);
  }, [viewer, uid]);

  // Smooth the progress bar between 30s sync ticks by advancing it locally every second,
  // clamped to durationMs — the actual number only ever moves forward in real increments from
  // Spotify itself; this just avoids the bar visibly freezing for up to 30s at a time.
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!data?.isPlaying || data.durationMs === undefined) return;
    setDisplayProgress(data.progressMs ?? 0);
    tickRef.current = setInterval(() => {
      setDisplayProgress((p) => Math.min(data.durationMs ?? p, p + 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [data?.isPlaying, data?.progressMs, data?.durationMs]);

  const canShow = targetProfile?.spotifyConnected === true && targetProfile?.showNowPlaying !== false;
  if (!canShow || !data) return null;

  async function handleListenAlong() {
    if (!viewer || !data?.previewUrl || !data.trackName) return;
    try {
      await listenAlong(uid, viewer.uid, data.previewUrl, data.trackName);
      setListenOpen(true);
    } catch {
      // listenAlong already logs — the panel just won't open.
    }
  }

  if (compact) {
    return (
      <div className="relative">
        <CompactNowPlayingRow data={data} onClick={() => setPopoverOpen((o) => !o)} />
        {popoverOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-72" onMouseLeave={() => setPopoverOpen(false)}>
            <div className="rounded-2xl border border-bg4 bg-bg2 p-4 shadow-2xl">
              <FullCardBody
                data={data}
                displayProgress={displayProgress}
                canListenAlong={!!viewer && viewer.uid !== uid}
                onListenAlong={handleListenAlong}
              />
            </div>
          </div>
        )}
        {listenOpen && viewer && (
          <ListenAlongPanel
            hostUid={uid}
            hostHandle={targetProfile?.handle ?? targetProfile?.displayName ?? "creator"}
            listenerUid={viewer.uid}
            onClose={() => setListenOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
      <FullCardBody
        data={data}
        displayProgress={displayProgress}
        canListenAlong={!!viewer && viewer.uid !== uid}
        onListenAlong={handleListenAlong}
      />
      {listenOpen && viewer && (
        <ListenAlongPanel
          hostUid={uid}
          hostHandle={targetProfile?.handle ?? targetProfile?.displayName ?? "creator"}
          listenerUid={viewer.uid}
          onClose={() => setListenOpen(false)}
        />
      )}
    </div>
  );
}

function FullCardBody({
  data,
  displayProgress,
  canListenAlong,
  onListenAlong,
}: {
  data: NowPlaying;
  displayProgress: number;
  canListenAlong: boolean;
  onListenAlong: () => void;
}) {
  if (data.isPlaying) {
    const pct = data.durationMs ? Math.min(100, (displayProgress / data.durationMs) * 100) : 0;
    return (
      <div className="flex gap-4">
        {data.albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" src={data.albumArt} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-bg3">
            <SpotifyGlyph className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-noto text-[11px] font-semibold text-green-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Now Playing
          </div>
          <p className="mt-1 truncate font-syne text-sm font-semibold text-text">{data.trackName}</p>
          <p className="truncate font-noto text-xs text-muted">{data.artistName}</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg4">
            <div className="h-full rounded-full bg-green-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canListenAlong && data.previewUrl && (
              <button type="button" onClick={onListenAlong} className="btn-ghost px-3 py-1.5 text-xs">
                Listen Along 🎵
              </button>
            )}
            {data.trackUrl && (
              <a
                href={data.trackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-noto text-xs text-muted hover:text-green-500"
              >
                <ExternalLink className="h-3 w-3" /> Open in Spotify
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data.lastTrackName) return null;

  return (
    <div className="flex gap-4">
      {data.lastAlbumArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            loading="lazy"
          src={data.lastAlbumArt}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg object-cover grayscale"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-bg3 grayscale">
          <SpotifyGlyph className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-noto text-[11px] font-semibold text-muted">
          <Radio className="h-3 w-3" /> Last played
        </div>
        <p className="mt-1 truncate font-syne text-sm font-semibold text-text">{data.lastTrackName}</p>
        <p className="truncate font-noto text-xs text-muted">{data.lastArtistName}</p>
        {data.lastPlayedAt && (
          <p className="mt-1 font-noto text-[11px] text-muted">{formatTime(data.lastPlayedAt)}</p>
        )}
        {data.lastTrackUrl && (
          <a
            href={data.lastTrackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-fit items-center gap-1 font-noto text-xs text-muted hover:text-green-500"
          >
            <ExternalLink className="h-3 w-3" /> Open in Spotify
          </a>
        )}
      </div>
    </div>
  );
}
