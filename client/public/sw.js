// D-33 (G-100): the app shell survives a cold start without a network, so the field entry opens on a site with no signal after one visit.
//
// What is kept (one cache, "dashio-shell-v1"):
//   - the page itself ("/", the single index.html every route is served from): network first; the copy is used only when the network fails;
//   - the build's own files (/assets/ — hashed, never change — /fonts/, /brand/, /favicon.ico, /manifest.webmanifest): cache first.
// What is NEVER kept: anything under /api/ (every answer with a company's data comes from there), any request that is not a GET, any other
// origin. The company data a field engineer needs offline is the screen's own small copy (FieldEntry's remembered context and the offline
// queue, both tied to the signed-in user), not this worker. The rules live in `routeOf` below and are tested (client/src/lib/shellCache.test.tsx).
const CACHE = "dashio-shell-v1";
const SHELL = "/";
const MAX_FILES = 300; // old hashed files of past releases are dropped beyond this

const STATIC_PREFIXES = ["/assets/", "/fonts/", "/brand/"];
const STATIC_FILES = ["/favicon.ico", "/manifest.webmanifest"];

/** "never" | "shell" | "static": the whole policy, from the request alone. */
function routeOf(request, origin) {
  if (request.method !== "GET") return "never";
  const url = new URL(request.url);
  if (url.origin !== origin) return "never";
  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/healthz" || url.pathname === "/sw.js") return "never";
  if (request.mode === "navigate") return "shell";
  if (STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix)) || STATIC_FILES.includes(url.pathname)) return "static";
  return "never";
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) if (new URL(key.url).pathname !== SHELL) await cache.delete(key);
}

async function keep(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); await trim(cache); }
    return response;
  } catch { return undefined; }
}

async function shell(request) {
  try {
    const response = await fetch(request);
    // only the plain page is kept, under one key: every route is the same index.html
    if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) await (await caches.open(CACHE)).put(SHELL, response.clone());
    return response;
  } catch {
    const cached = await (await caches.open(CACHE)).match(SHELL);
    return cached || Response.error();
  }
}

async function staticFile(request) {
  const cached = await (await caches.open(CACHE)).match(request);
  return cached || (await keep(request)) || Response.error();
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(SHELL, { cache: "reload" }))).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("dashio-shell-") && name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const route = routeOf(event.request, self.location.origin);
  if (route === "shell") event.respondWith(shell(event.request));
  else if (route === "static") event.respondWith(staticFile(event.request));
  // "never": not handled, the browser goes to the network as if there were no worker
});

// The files the page loaded before this worker took control (its first visit) are sent here once, so they are kept too.
self.addEventListener("message", event => {
  const data = event.data;
  if (!data || data.type !== "dashio-keep-files" || !Array.isArray(data.urls)) return;
  event.waitUntil(Promise.all(data.urls.slice(0, MAX_FILES).map(url => {
    const request = new Request(url);
    return routeOf(request, self.location.origin) === "static" ? caches.open(CACHE).then(cache => cache.match(request).then(hit => hit || keep(request))) : undefined;
  })));
});

// for the unit test only (a worker's scope has no `module`)
if (typeof module !== "undefined") module.exports = { routeOf };
