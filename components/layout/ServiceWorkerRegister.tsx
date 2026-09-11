"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Registers public/sw.js — production only, and only when the browser actually supports the
 * API. Dev is deliberately excluded: a cached service worker fighting Next's dev-server hot
 * reload is a classic source of "why isn't my change showing up" confusion.
 *
 * Also tells the already-active service worker whenever the signed-in profile's Platinum status
 * is known/changes, so its own SET_PLATINUM gate (see public/sw.js's top-of-file Monetag block)
 * can skip importing the ad service-worker script for Platinum members. This is best-effort, not
 * a hard guarantee: `navigator.serviceWorker.controller` is only set once a service worker is
 * already controlling the page (never on the very first visit before one has activated), and the
 * flag itself lives only in that worker's in-memory scope, which the browser can reset by
 * terminating and restarting an idle service worker at any time. The ads a Platinum member could
 * actually SEE are fully blocked regardless, by every ad component's own isPlatinum check (see
 * MonetagScript/PropellerAdsScript/ReaderAdScript/AdSlot) — this only ever affects the ad
 * vendor's own background service-worker registration, not visible ad content. */
export default function ServiceWorkerRegister() {
  const { profile } = useAuth();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures shouldn't block the app — the site works fine without a SW,
      // just without offline/install support.
    });
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_PLATINUM',
        isPlatinum: profile?.isPlatinum || false
      });
    }
  }, [profile?.isPlatinum]);

  return null;
}
