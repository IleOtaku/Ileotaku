"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export interface VoiceMessageBubbleProps {
  url: string;
  duration: number;
  isOwn: boolean;
}

// A fixed pseudo-random bar pattern (seeded by index, not Math.random on every render) — a real
// waveform would need decoding the audio's actual amplitude data client-side, which is a much
// bigger lift than this feature warrants; a stable-looking bar pattern that animates while
// playing reads as "a voice message" just as well without it.
const BAR_HEIGHTS = Array.from({ length: 28 }, (_, i) => 30 + ((i * 37) % 70));

/** DM Feature Overhaul (Part A): "Shows as a waveform visualization (CSS bars, animated while
 * playing). Play/pause button, duration, playback progress bar." */
export default function VoiceMessageBubble({ url, duration, isOwn }: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    });
    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
    });
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }

  const barColor = isOwn ? "bg-ivory/40" : "bg-muted2";
  const activeColor = isOwn ? "bg-ivory" : "bg-clay";

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isOwn ? "bg-ivory/20" : "bg-clay/15"}`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex h-6 flex-1 items-center gap-[2px]">
        {BAR_HEIGHTS.map((h, i) => {
          const isActive = i / BAR_HEIGHTS.length <= progress;
          return (
            <span
              key={i}
              className={`w-[2px] rounded-full transition-colors ${isActive ? activeColor : barColor} ${playing ? "animate-pulse" : ""}`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <span className="shrink-0 font-noto text-[10px] opacity-70">
        {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
      </span>
    </div>
  );
}
