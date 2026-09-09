"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const SHOW_DURATION_MS = 1500;
const FADE_DURATION_MS = 400;

/** Full-screen splash shown while the app's initial JS parses/hydrates — a breathing eye icon
 * with the wordmark fading in below it, gone within two seconds so it reads as a brand moment
 * rather than a loading blocker. Mounted from the root layout, above SiteChrome/everything
 * else, so it covers the very first paint; a plain 1.5s timer stands in for "when the app is
 * ready" rather than wiring a real readiness signal through every provider — by the time this
 * component's own effect fires, the JS bundle mounting it has already parsed and hydrated, so
 * in practice the two conditions the spec asks for (a fixed 1.5s, or the app being ready)
 * resolve at the same moment anyway. Since it lives in the root layout rather than a per-route
 * one, a client-side navigation to another page never remounts it — only an actual fresh page
 * load (first visit, hard refresh, a new tab) does, which is exactly "initial app load". */
export default function Preloader() {
  const [fadingOut, setFadingOut] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), SHOW_DURATION_MS);
    const removeTimer = setTimeout(() => setMounted(false), SHOW_DURATION_MS + FADE_DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-bg transition-opacity duration-[400ms] ease-out ${
        fadingOut ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={80}
        height={80}
        priority
        className="animate-preloader-breathe rounded-2xl"
      />
      <span
        className="animate-preloader-fade-in font-cinzel text-xl text-gold"
        style={{ animationDelay: "0.3s", animationFillMode: "both" }}
      >
        ÍléOtaku
      </span>
    </div>
  );
}
