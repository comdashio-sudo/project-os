// D-33 (G-100): the app shell for a cold start with no network. What it keeps, on this device only:
//   - the page itself (index.html — the same static file for every route; it holds no company data),
//   - the built files it loads (/assets/… with a hash in the name, the fonts, the brand marks, the favicon and the manifest).
// What it NEVER keeps: anything under /api/ (every company figure, list or file comes from there) and /healthz. Those requests are not even
// looked at: they go to the network as if there were no worker, and fail offline as before. The field screen's own last-read data is kept by the
// screen in this device's storage (FieldEntry, offlineQueue), under the signed-in person, not here.
// Pages: network first (a new release is picked up at once when online), the kept shell when the network is gone.
// Files: kept on first use; a hashed file never changes, so the kept copy is served first.
const VERSION = "dashio-shell-v1";
const SHELL = "/index.html";
const KEPT_FILES = /^\/(?:assets\/|fonts\/|brand\/|favicon\.ico$|manifest\.webmanifest$)/;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.add(new Request(SHELL, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== VERSION).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

/** What the worker does with a request: "network" (not touched), "page" or "file". Exposed for the unit test. */
function routeOf(request) {
  if (request.method !== "GET") return "network";
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return "network";
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") return "network";
  if (request.mode === "navigate") return "page";
  if (KEPT_FILES.test(url.pathname)) return "file";
  return "network";
}
self.dashioRouteOf = routeOf;

// The files the page loaded before this worker controlled it (the first visit) are named by the page itself (client/src/main.tsx); only the
// allowed kinds above are kept — a name outside KEPT_FILES (any /api/ URL included) is ignored.
self.addEventListener("message", event => {
  if (event.data?.type !== "keep" || !Array.isArray(event.data.urls)) return;
  const wanted = event.data.urls.filter(href => { try { const url = new URL(href); return url.origin === self.location.origin && KEPT_FILES.test(url.pathname); } catch { return false; } });
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(wanted.map(href => cache.match(href).then(kept => kept ?? cache.add(href).catch(() => undefined))))));
});

self.addEventListener("fetch", event => {
  const route = routeOf(event.request);
  if (route === "network") return;
  if (route === "page") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(SHELL, copy)); }
      return response;
    }).catch(() => caches.match(SHELL).then(kept => kept ?? Response.error())));
    return;
  }
  event.respondWith(caches.match(event.request).then(kept => kept ?? fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(event.request, copy)); }
    return response;
  })));
});
