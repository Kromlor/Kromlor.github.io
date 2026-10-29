/* Companion · Janine — C-013 hand-written service worker (no deps).
 * Build step (vite.config.js → janinePrecache plugin) replaces the two lines marked
 * __JANINE_BUILD__ in dist/sw.js with the real versions + precache lists. This source copy
 * (dev) is never registered: registration is import.meta.env.PROD only.
 *
 * Strategies
 *   navigations              network-first (4 s timeout) → cached /index.html
 *   /assets/* (hashed)       cache-first (precached)
 *   /avatar/*, /lifestyle/*  cache-first (precached best-effort + runtime fill); Range → 206 from cache
 *   other same-origin GET    cache-first → network
 *   cross-origin / non-GET   untouched (never cached)
 * Caches: janine-shell-<build> + janine-media-<media hash>; anything else janine-* is deleted on activate.
 * IndexedDB / localStorage are never touched here.
 */
const BUILD = {"shell":"09db806f82","media":"0372927f00"}; // __JANINE_BUILD__
const PRECACHE = {"shell":["/index.html","/manifest.webmanifest","/favicon.svg","/assets/index-BDqXS4e2.css","/assets/index-DLCRMDgZ.js","/icons/apple-touch-icon.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png"],"media":["/avatar/clips/manifest.json","/avatar/clips/nod.mp4","/avatar/clips/smile.mp4","/avatar/clips/talk.mp4","/avatar/janine-ref.png","/avatar/l3/manifest.json","/avatar/l3/talk-loop.mp4","/lifestyle/manifest.json","/lifestyle/scenes/scene-bedroom-tv/close.jpg","/lifestyle/scenes/scene-bedroom-tv/full.jpg","/lifestyle/scenes/scene-bedroom-tv/mid.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-day-soft/close.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-day-soft/full.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-day-soft/mid.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-evening-ease/close.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-evening-ease/full.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-evening-ease/mid.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-weekend-bright/close.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-weekend-bright/full.jpg","/lifestyle/scenes/scene-bedroom-tv/variants/outfit-weekend-bright/mid.jpg","/lifestyle/scenes/scene-change-outfit/close.jpg","/lifestyle/scenes/scene-change-outfit/full.jpg","/lifestyle/scenes/scene-change-outfit/mid.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-day-soft/close.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-day-soft/full.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-day-soft/mid.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-evening-ease/close.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-evening-ease/full.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-evening-ease/mid.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-weekend-bright/close.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-weekend-bright/full.jpg","/lifestyle/scenes/scene-change-outfit/variants/outfit-weekend-bright/mid.jpg","/lifestyle/scenes/scene-kitchen-dishes/close.jpg","/lifestyle/scenes/scene-kitchen-dishes/full.jpg","/lifestyle/scenes/scene-kitchen-dishes/mid.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-day-soft/close.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-day-soft/full.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-day-soft/mid.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-evening-ease/close.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-evening-ease/full.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-evening-ease/mid.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-weekend-bright/close.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-weekend-bright/full.jpg","/lifestyle/scenes/scene-kitchen-dishes/variants/outfit-weekend-bright/mid.jpg","/lifestyle/scenes/scene-living-couch/close.jpg","/lifestyle/scenes/scene-living-couch/full.jpg","/lifestyle/scenes/scene-living-couch/mid.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-day-soft/close.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-day-soft/full.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-day-soft/mid.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-evening-ease/close.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-evening-ease/full.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-evening-ease/mid.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-weekend-bright/close.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-weekend-bright/full.jpg","/lifestyle/scenes/scene-living-couch/variants/outfit-weekend-bright/mid.jpg"]}; // __JANINE_BUILD__

const SHELL_CACHE = `janine-shell-${BUILD.shell}`;
const MEDIA_CACHE = `janine-media-${BUILD.media}`;
const KEEP = new Set([SHELL_CACHE, MEDIA_CACHE]);
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // Shell must be complete or install fails (old SW keeps serving).
    await shell.addAll(PRECACHE.shell.map((u) => new Request(u, { cache: 'reload' })));
    // Media: best-effort; misses are filled at runtime.
    const media = await caches.open(MEDIA_CACHE);
    await Promise.allSettled(PRECACHE.media.map(async (u) => {
      if (await media.match(u)) return;
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (res.ok && res.status === 200) await media.put(u, res);
    }));
  })());
  // No skipWaiting here: an update waits until the user taps "Update ready".
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('janine-') && !KEEP.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source && event.source.postMessage({ type: 'VERSION', build: BUILD });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNav(req));
    return;
  }
  if (url.pathname.startsWith('/avatar/') || url.pathname.startsWith('/lifestyle/')) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }
  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

async function networkFirstNav(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (res.ok && res.status === 200 && res.type === 'basic') {
      cache.put('/index.html', res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const hit = (await cache.match('/index.html')) || (await caches.match('/index.html'));
    if (hit) return hit.redirected ? new Response(await hit.blob(), { status: 200, headers: hit.headers }) : hit;
    return new Response('<!doctype html><title>Offline</title><p>Janine is offline and the app shell is not cached yet.</p>', {
      status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirst(req, cacheName) {
  const url = new URL(req.url);
  const key = url.origin + url.pathname; // ignore ?query (e.g. cache-busters)
  const range = req.headers.get('range');
  let hit = await caches.match(key, { ignoreSearch: true });
  if (hit) return range ? rangeResponse(hit, range) : hit;
  try {
    // Fetch the full resource (no Range) so it can be cached once, then slice.
    const res = await fetch(range ? new Request(key, { credentials: 'same-origin' }) : req);
    if (res.ok && res.status === 200 && res.type === 'basic') {
      const cache = await caches.open(cacheName);
      await cache.put(key, res.clone());
      return range ? rangeResponse(res, range) : res;
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function rangeResponse(res, rangeHeader) {
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  if (!m) return new Response(buf, { status: 200, headers: res.headers });
  let start = m[1] === '' ? NaN : Number(m[1]);
  let end = m[2] === '' ? NaN : Number(m[2]);
  if (Number.isNaN(start)) { start = Math.max(0, size - (Number.isNaN(end) ? 0 : end)); end = size - 1; }
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start >= size || start > end) {
    return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(res.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
