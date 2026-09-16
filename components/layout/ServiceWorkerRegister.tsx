"use client";

import { useEffect } from "react";

const PUSH_CLEANUP_KEY = "ileotaku-stale-push-cleanup-v1";

/** Beta feedback bug: "Notifications push nothing but ads, even when i have activities going
 * on" / "Ads should stop sending notifications." Removing Monetag's importScripts from sw.js
 * (see that file's own history) stops any NEW ad push subscription from being created, but a
 * browser that had already granted permission to the OLD ad-serving worker keeps a real
 * PushSubscription object that's independent of whatever code is on the page now — Monetag (or
 * whichever vendor) owns that subscription's endpoint and can keep sending to it forever unless
 * it's explicitly unsubscribed. This purges any such leftover subscription once per browser (the
 * localStorage flag stops it from ever re-running and fighting a real, legitimate FCM
 * subscription this same user opts into later via Settings). */
async function cleanupStalePushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    if (localStorage.getItem(PUSH_CLEANUP_KEY)) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    localStorage.setItem(PUSH_CLEANUP_KEY, "true");
  } catch {
    // Best-effort — worst case a stray ad subscription lingers a little longer, not a crash.
  }
}

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

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => cleanupStalePushSubscription(registration))
      .catch(() => {
        // Registration failures shouldn't block the app — the site works fine without a SW,
        // just without offline/install support.
      });
  }, []);

  return null;
}
