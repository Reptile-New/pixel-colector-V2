/**
 * Offline support. The whole game is ~80 kB of static files, so the strategy can
 * stay simple and predictable:
 *
 *  - navigations: network first, cache as fallback  → a new version is picked up
 *    on the next online launch, and the game still opens on the métro.
 *  - everything else: cache first, revalidate in the background.
 *
 * Bumping CACHE invalidates the old bundle; `self.skipWaiting()` plus
 * `clients.claim()` means the player never has to close the app twice to update.
 */
const CACHE = 'pixel-collector-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']))
      .catch(() => undefined) // a failed precache must never block activation
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit ?? network
    }),
  )
})
