/* ============================================================
   Nosh service worker — keeps the app openable with no signal.

   Deliberately does NOT touch Supabase requests. Caching API reads
   would show stale data with no way to tell it was stale, and
   caching writes would silently drop them. Offline writes are the
   outbox's job (offline.js); this file only makes sure the app
   itself loads.

   Nothing is precached at install: Vite fingerprints its bundles
   (index-a1b2c3.js) and this file has no way to know those names.
   Instead every same-origin asset is cached as it's fetched, so the
   first online visit primes the cache and every later visit works
   offline. Practically: open Nosh once at home, and it works in the
   store.
   ============================================================ */

const VERSION = 'nosh-v1'
const SHELL = 'nosh-shell-' + VERSION

self.addEventListener('install', (event) => {
  // Take over as soon as possible rather than waiting for every tab to close.
  event.waitUntil(caches.open(SHELL).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

// Let the page tell a waiting worker to activate immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return   // Supabase et al: untouched

  // Navigations: try the network so a deploy is picked up, fall back to the
  // cached shell when offline. The app is a hash router, so index.html serves
  // every route.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(SHELL)
          cache.put('/index.html', fresh.clone())
          return fresh
        } catch {
          const cache = await caches.open(SHELL)
          return (await cache.match('/index.html')) ||
                 (await cache.match(req)) ||
                 new Response(
                   '<!doctype html><meta charset="utf-8"><title>Nosh</title>' +
                   '<body style="font:16px system-ui;padding:40px;text-align:center">' +
                   '<p>Nosh hasn\'t been saved for offline use yet.</p>' +
                   '<p>Open it once with a connection, then it\'ll work without one.</p>',
                   { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                 )
        }
      })()
    )
    return
  }

  // Everything else same-origin (JS, CSS, icons): serve from cache when we
  // have it, and refresh the copy in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL)
      const hit = await cache.match(req)

      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => null)

      if (hit) return hit
      const res = await network
      if (res) return res
      return new Response('', { status: 504, statusText: 'Offline' })
    })()
  )
})
