// PropellerAds
self.options = {
    "domain": "5gvci.com",
    "zoneId": 11756578
}
self.lary = ""
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')

// ÍléOtaku PWA - existing code below unchanged
/**
 * ÍléOtaku service worker.
 *
 * Strategy: Cache First for static assets (Next.js build output, fonts, images) — they're
 * content-hashed or rarely change, so serving straight from cache is both faster and correct.
 * Network First for API calls and page navigations — readers should always see fresh content
 * when online, falling back to whatever's cached (or the offline page) only when the network
 * genuinely fails.
 */

const VERSION = "v1";
const SHELL_CACHE = `ileotaku-shell-${VERSION}`;
const STATIC_CACHE = `ileotaku-static-${VERSION}`;
const DYNAMIC_CACHE = `ileotaku-dynamic-${VERSION}`;
const COVER_CACHE = `ileotaku-covers-${VERSION}`;
const CHAPTER_CACHE = `ileotaku-chapters-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const APP_SHELL = ["/", "/reader", "/explore", "/search", "/pricing", "/profile", OFFLINE_URL];

const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE, DYNAMIC_CACHE, COVER_CACHE, CHAPTER_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) => cache.add(url).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !ALL_CACHES.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|woff2?|ttf|otf|eot|ico|png|jpg|jpeg|webp|svg|gif)$/i.test(url.pathname)
  );
}

function isMangaCoverImage(url) {
  // Creator cover art and chapter pages, all served from Cloudinary — cached opportunistically
  // as they're viewed, so previously-browsed series still show art while offline.
  return /res\.cloudinary\.com/i.test(url.hostname);
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Opportunistically cache manga cover art the reader loads, without ever blocking the load.
  if (isMangaCoverImage(url)) {
    event.respondWith(cacheFirst(request, COVER_CACHE));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isNavigationRequest(request) || url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Everything else: network first, dynamic cache as a fallback.
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ---------------------------- On-demand chapter caching (Platinum offline downloads) ----------------------------
// lib/offlineReader.ts stores page image blobs in IndexedDB directly (works fully offline, no
// SW dependency), but also posts here so the same page URLs are cached at the HTTP layer too —
// belt-and-suspenders in case IndexedDB is unavailable in some browser context.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_CHAPTER_PAGES" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CHAPTER_CACHE).then((cache) =>
      Promise.all(
        data.urls.map((pageUrl) =>
          fetch(pageUrl)
            .then((res) => (res.ok ? cache.put(pageUrl, res) : null))
            .catch(() => null)
        )
      )
    )
  );
});

// ---------------------------- Push notifications ----------------------------
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: "ÍléOtaku", body: event.data ? event.data.text() : "" } };
  }
  const notification = payload.notification || payload || {};
  const title = notification.title || "ÍléOtaku";
  const options = {
    body: notification.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    data: { url: (payload.data && payload.data.url) || notification.click_action || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
