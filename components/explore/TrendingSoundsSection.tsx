"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Music, Pause, Play } from "lucide-react";
import { SOUND_CATEGORY_COLORS } from "@/lib/sounds";
import type { Sound } from "@/types";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface TrendingSoundsSectionProps {
  sounds: Sound[];
}

/** Explore page's "Trending Sounds" grid — the top 6 most-used sounds this week. Each card
 * previews with a play button and links to /feed?sound={id}, which filters the Creator Feed
 * down to posts using that exact sound — the same viral-sound-loop pattern TikTok's sound
 * pages use, just routed through the feed's own sound filter rather than a separate page. */
export default function TrendingSoundsSection({ sounds }: TrendingSoundsSectionProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  function togglePreview(sound: Sound) {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.addEventListener("ended", () => setPreviewingId(null));
      audioRef.current = audio;
    }
    if (previewingId === sound.id) {
      audio.pause();
      setPreviewingId(null);
      return;
    }
    audio.src = sound.url;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPreviewingId(sound.id);
  }

  if (sounds.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sounds.map((sound) => (
        <div key={sound.id} className="flex items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-4">
          <button
            type="button"
            onClick={() => togglePreview(sound)}
            aria-label={previewingId === sound.id ? "Pause preview" : "Play preview"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${SOUND_CATEGORY_COLORS[sound.category]}`}
          >
            {previewingId === sound.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <Link href={`/feed?sound=${encodeURIComponent(sound.id)}`} className="min-w-0 flex-1">
            <p className="truncate font-syne text-sm font-semibold text-text hover:text-gold">
              {sound.title}
            </p>
            <p className="truncate font-noto text-xs text-muted">
              {sound.artist} · {formatDuration(sound.duration)}
            </p>
            <p className="mt-1 font-noto text-[11px] text-clay2">
              Used in {sound.usageCount.toLocaleString()} posts
            </p>
          </Link>
        </div>
      ))}
    </div>
  );
}

export function TrendingSoundsEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-muted2 bg-bg2 px-6 py-10 text-center">
      <Music className="h-6 w-6 text-muted" />
      <p className="font-noto text-sm text-muted">
        No sounds have been used yet — be the first to add one to a post.
      </p>
    </div>
  );
}
