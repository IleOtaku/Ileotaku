"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration, seededWaveform } from "@/lib/voiceRecorder";

export interface VoiceMessageBubbleProps {
  url: string;
  /** Total length in seconds, as measured when it was recorded. */
  duration: number;
  isOwn: boolean;
  /** Loudness bars (12..100) saved with the message; older voice notes fall back to a seeded pattern. */
  waveform?: number[];
  /** The sender's custom bubble color (hex). When set, the play button and waveform are drawn from it. */
  accentColor?: string;
}

/** A voice message in the thread: [▶ Play] [waveform] [0:42].
 * Tap play: the audio plays, the waveform fills left to right and the bars around the playhead
 * bounce, and the time shows the current position. Tap again: pauses. When idle it shows the total
 * length.
 *
 * MediaRecorder output has no duration header, so `audio.duration` is `Infinity` in most browsers —
 * progress is therefore measured against the duration saved with the message, not the element's own
 * (which is why the fill used to never move). */
export default function VoiceMessageBubble({ url, duration, isOwn, waveform, accentColor }: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audio.preload = "metadata";
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => {
      const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      setPosition(Math.min(audio.currentTime, total || audio.currentTime));
    });
    audio.addEventListener("ended", () => {
      setPlaying(false);
      setPosition(0);
    });
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("error", () => setPlaying(false));
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [url, duration]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  const bars = waveform && waveform.length > 0 ? waveform : seededWaveform(url.length * 977 + duration, 36);
  const total = duration > 0 ? duration : position;
  const progress = total > 0 ? position / total : 0;
  const activeIndex = Math.floor(progress * bars.length);

  // Beta feedback: "the color picked for dms bubble should be the same for the voice note icon."
  // With a custom bubble color the whole control is drawn from it: the play button is a solid disc in
  // the bubble's text color with the play/pause glyph cut out in the bubble color itself, and the
  // waveform uses that same text color — so the picked color IS the voice-note icon, on any bubble.
  const custom = !!accentColor;
  const barColor = custom ? "bg-current opacity-35" : isOwn ? "bg-ivory/35" : "bg-muted2";
  const activeColor = custom ? "bg-current" : isOwn ? "bg-ivory" : "bg-clay";

  return (
    <div className="flex min-w-[200px] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        data-testid="voice-play"
        style={custom ? { background: "currentColor" } : undefined}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${custom ? "" : isOwn ? "bg-ivory/20" : "bg-clay/15"}`}
      >
        <span style={custom ? { color: accentColor } : undefined} className="flex">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </span>
      </button>
      <div className="flex h-7 flex-1 items-center gap-[2px]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        {bars.map((h, i) => {
          const isActive = i < activeIndex || (progress > 0 && i === activeIndex);
          const nearHead = playing && Math.abs(i - activeIndex) <= 1;
          return (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full transition-all duration-150 ${isActive ? activeColor : barColor}`}
              style={{ height: `${h}%`, transform: nearHead ? "scaleY(1.25)" : undefined }}
            />
          );
        })}
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-80" data-testid="voice-time">
        {formatDuration(playing || position > 0 ? position : duration)}
      </span>
    </div>
  );
}
