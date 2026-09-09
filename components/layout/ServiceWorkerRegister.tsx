"use client";

import { useEffect } from "react";

/** Registers public/sw.js — production only, and only when the browser actually supports the
 * API. Dev is deliberately excluded: a cached service worker fighting Next's dev-server hot
 * reload is a classic source of "why isn't my change showing up" confusion. */
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
