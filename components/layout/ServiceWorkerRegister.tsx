"use client";

import { useEffect } from "react";

/** Registers public/sw.js — production only, and only when the browser actually supports the
 * API. Dev is deliberately excluded: a cached service worker fighting Next's dev-server hot
 * reload is a classic source of "why isn't my change showing up" confusion.
 *
 * Ads overhaul: this used to also postMessage a SET_PLATINUM flag to the active service worker,
 * for a since-removed Monetag ad service-worker gate in public/sw.js. Removed here too now that
 * nothing on the worker side listens for it — every ad component's own isPlatinum check (see
 * MonetagScript/PropellerAdsScript/ReaderAdScript/AdSlot) is what actually keeps a Platinum
 * member from ever seeing an ad; this was only ever a best-effort assist for a vendor script that
 * no longer runs at all. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures shouldn't block the app — the site works fine without a SW,
      // just without offline/install support.
    });
  }, []);

  return null;
}
