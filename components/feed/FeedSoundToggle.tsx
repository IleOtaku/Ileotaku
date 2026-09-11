"use client";

import { useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useFeedAudio } from "@/lib/audioContext";

/**
 * Global sound toggle for the feed page — one speaker icon controls every post's audio at once
 * (muting one video mutes all, per the TikTok Feed Overhaul spec), since `isMuted` lives in
 * FeedAudioProvider rather than per-card state. Desktop shows a volume slider on hover; mobile
 * just toggles mute on tap.
 */
export default function FeedSoundToggle() {
  const { isMuted, setMuted, volume, setVolume } = useFeedAudio();
  const [hovering, setHovering] = useState(false);

  const Icon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        onClick={() => setMuted(!isMuted)}
        aria-label={isMuted ? "Unmute" : "Mute"}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
      >
        <Icon className="h-4 w-4" />
      </button>
      {hovering && (
        <div className="absolute right-full mr-2 hidden items-center rounded-full bg-black/60 px-3 py-2 backdrop-blur sm:flex">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setVolume(v);
              if (v > 0 && isMuted) setMuted(false);
            }}
            className="h-1 w-20 accent-white"
            aria-label="Volume"
          />
        </div>
      )}
    </div>
  );
}
