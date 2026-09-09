"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks window.visualViewport's height, which shrinks to the space actually visible above
 * an on-screen keyboard (unlike window.innerHeight / vh units, which stay pinned to the
 * layout viewport on most mobile browsers while the keyboard is open). Returns null where
 * visualViewport isn't supported, so callers can fall back to a static vh-based height.
 *
 * Rounds to whole pixels and skips no-op updates — visualViewport can fire a burst of
 * "resize" events with sub-pixel-different heights while the browser chrome (address bar,
 * etc.) settles right after page load, and without this a naive setState-per-event here
 * causes a matching burst of re-renders in every consumer during those first couple seconds.
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const next = Math.round(vv!.height);
      if (lastRef.current === next) return;
      lastRef.current = next;
      setHeight(next);
    }
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return height;
}
