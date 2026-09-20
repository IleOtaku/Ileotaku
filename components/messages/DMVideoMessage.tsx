"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import MentionText from "@/components/ui/MentionText";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { downloadMediaDirect } from "@/lib/videoDownload";
import { formatDuration } from "@/lib/voiceRecorder";

export interface DMVideoMessageProps {
  url: string;
  /** Poster frame; derived from a Cloudinary url when not given. */
  posterUrl?: string;
  /** Length in seconds, when known (saved with the message). */
  duration?: number;
  width?: number;
  height?: number;
  caption?: string;
  isOwn: boolean;
}

const CARD_WIDTH = 280;
const CONTROLS_HIDE_MS = 2500;

/** A video in a chat bubble with OUR controls — the browser's default ones never appear (`controls` is
 * never set, and picture-in-picture / native download menus are switched off too).
 * - Paused: poster frame, big play button, duration badge top-right.
 * - Tap the video: play / pause. While it plays the controls fade out after 2.5s and return on tap or
 *   mouse-move. Muted by default (browsers only allow silent autoplay) with an unmute button.
 * - Controls: play/pause, mute, current / total time, a scrubbable seek bar, fullscreen, and Download.
 *   Download is ALWAYS the plain original — private conversations are never watermarked. */
export function DMVideoMessage({ url, posterUrl, duration, width, height, caption, isOwn }: DMVideoMessageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [showControls, setShowControls] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const derivedPoster = posterUrl ?? getVideoThumbnail(url);
  const poster = !posterFailed && derivedPoster !== url ? derivedPoster : undefined;
  // Box shape: the clip's own ratio, kept between 0.7 (tall) and 1.8 (wide) so the card is never taller than
  // 400px at 280 wide; the video fills it (object-cover). Fullscreen shows the whole frame.
  const ratio = Math.min(1.8, Math.max(0.7, width && height ? width / height : 16 / 9));
  const progress = total > 0 ? (current / total) * 100 : 0;

  useEffect(() => setTotal(duration ?? 0), [duration]);
  useEffect(() => () => void (controlsTimer.current && clearTimeout(controlsTimer.current)), []);

  function showControlsTemporarily() {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setPlaying(false));
    else v.pause();
    showControlsTemporarily();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total;
    showControlsTemporarily();
  }

  function fullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  }

  const controlsVisible = showControls || !playing;

  return (
    <div
      className={cn("relative mb-1 overflow-hidden rounded-2xl bg-black", isOwn ? "rounded-tr-sm" : "rounded-tl-sm")}
      style={{ width: CARD_WIDTH, maxWidth: "100%" }}
      onMouseMove={showControlsTemporarily}
      data-testid="dm-video-card"
    >
      <div className="relative cursor-pointer" style={{ aspectRatio: ratio }} onClick={togglePlay}>
        {/* No `controls`, ever. The #t fragment makes iOS paint the first frame when there's no poster. */}
        <video
          ref={videoRef}
          src={`${url}#t=0.1`}
          poster={poster}
          controls={false}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          playsInline
          preload="metadata"
          muted={muted}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setShowControls(true);
          }}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          data-testid="dm-video"
        />

        {!playing && (
          <button type="button" onClick={(e) => { e.stopPropagation(); togglePlay(); }} aria-label="Play video" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="ml-1 h-6 w-6 text-white" fill="white" />
            </span>
          </button>
        )}

        {(playing || total > 0) && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-xs text-white" data-testid="video-duration">
            {playing ? formatDuration(current) : formatDuration(total)}
          </span>
        )}

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 transition-opacity",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={(e) => e.stopPropagation()}
          data-testid="dm-video-controls"
        >
          <div onClick={seek} className="mb-2 cursor-pointer py-1" role="progressbar" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className="h-1 w-full rounded-full bg-white/30">
              <div className="h-full rounded-full bg-clay" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); togglePlay(); }} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); showControlsTemporarily(); }} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <span className="font-mono text-xs tabular-nums">
                {formatDuration(current)} / {formatDuration(total)}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={fullscreen} aria-label="Fullscreen">
                <Maximize2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); void downloadMediaDirect(url, "video.mp4"); }} aria-label="Download video">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {caption && !playing && (
        <div className="bg-black/30 px-3 py-2">
          <p className="whitespace-pre-wrap font-noto text-sm text-white" data-testid="dm-media-caption">
            <MentionText text={caption} />
          </p>
        </div>
      )}
    </div>
  );
}

export default DMVideoMessage;
