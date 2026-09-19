"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { formatDuration } from "@/lib/voiceRecorder";

/** Inline video for DM bubbles, with our own controls instead of the browser's default ones.
 * Idle: the poster frame with a play button and the duration badge (top-right). Tap: it plays inline,
 * muted (browsers only autoplay muted media) with an unmute button, play/pause, a scrubbable progress
 * bar, remaining time and fullscreen. */
export default function DMVideoPlayer({ url, duration, width, height }: { url: string; duration?: number; width?: number; height?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [posterFailed, setPosterFailed] = useState(false);

  const poster = getVideoThumbnail(url);
  const hasPoster = poster !== url && !posterFailed;
  const ratio = width && height ? width / height : 16 / 9;
  // An explicit width is required: a box that only has an aspect-ratio has no intrinsic width, so inside
  // a shrink-to-fit chat bubble it would collapse to 0x0. Landscape clips are up to 340px wide,
  // portrait ones scale down so they never exceed 300px tall.
  const boxWidth = Math.round(Math.min(340, 300 * ratio));

  useEffect(() => setTotal(duration ?? 0), [duration]);

  function start() {
    setStarted(true);
    // The element only exists once `started` renders; play on the next frame.
    requestAnimationFrame(() => videoRef.current?.play().catch(() => setPlaying(false)));
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return start();
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total;
  }

  function fullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  }

  const remaining = Math.max(0, total - current);

  return (
    <div
      className="relative mb-1 overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: ratio, width: boxWidth, maxWidth: "100%" }}
    >
      {!started && (
        <>
          {hasPoster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" loading="lazy" onError={() => setPosterFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          )}
          <button type="button" onClick={start} aria-label="Play video" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
            </span>
          </button>
          {total > 0 && (
            <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white" data-testid="video-duration">
              {formatDuration(total)}
            </span>
          )}
        </>
      )}

      {started && (
        <>
          <video
            ref={videoRef}
            src={url}
            muted={muted}
            playsInline
            preload="metadata"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          />
          {!playing && (
            <button type="button" onClick={togglePlay} aria-label="Play" className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
                <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-6 text-white">
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="shrink-0">
              {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
            </button>
            <div onClick={seek} className="relative h-3 flex-1 cursor-pointer py-[5px]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((current / total) * 100) : 0}>
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-clay" style={{ width: `${total ? (current / total) * 100 : 0}%` }} />
              </div>
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums">-{formatDuration(remaining)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="shrink-0"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button type="button" onClick={fullscreen} aria-label="Fullscreen" className="shrink-0">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
