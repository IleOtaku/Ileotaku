"use client";

import { useEffect, useState } from "react";
import { CompactNowPlayingRow } from "./NowPlayingCard";
import { getUserProfile } from "@/lib/firestore";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import type { NowPlaying } from "@/types";

export interface SpotifyMiniPlayerProps {
  uid: string;
}

/**
 * Lightweight Now Playing row for DM headers, comment author names, and chat bubbles — anywhere
 * a Spotify status might render many times on one screen. Unlike NowPlayingCard, this fetches
 * both the profile flags and the `nowPlaying` doc exactly once on mount rather than subscribing,
 * since a real-time listener per row (per DM in a list, per comment) doesn't scale the way one
 * listener on a single profile page does. Renders nothing if the user hasn't connected Spotify,
 * has opted out via `showNowPlaying`, or has no nowPlaying doc yet.
 */
export default function SpotifyMiniPlayer({ uid }: SpotifyMiniPlayerProps) {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<NowPlaying | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getUserProfile(uid);
      if (cancelled) return;
      const canShow = profile?.spotifyConnected === true && profile?.showNowPlaying !== false;
      setVisible(canShow);
      if (!canShow) return;
      const np = await getNowPlayingOnce(uid);
      if (!cancelled) setData(np);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!visible || !data) return null;
  return <CompactNowPlayingRow data={data} />;
}
