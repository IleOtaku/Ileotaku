"use client";

import { useEffect } from "react";
import { preloadSounds } from "@/lib/notificationSounds";

/**
 * Beta feedback: "Preload all sounds on app init... after first user interaction." Browsers block
 * audio playback (and, on some, the network fetch/decode itself) started with no prior user
 * gesture — waiting for the first click/tap anywhere on the page before preloading means the very
 * first real notification sound doesn't pay that cost or risk being silently blocked.
 */
export default function SoundPreloader() {
  useEffect(() => {
    function handleFirstInteraction() {
      preloadSounds();
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    }
    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction);
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  return null;
}
