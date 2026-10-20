/*
 * Service Worker SamaAdresse — mode hors ligne partiel.
 *
 * Ce qui est mis en cache :
 *  - l'application elle-même (page, scripts, styles, icônes) pour s'ouvrir sans réseau ;
 *  - les fiches PUBLIQUES déjà consultées (GET /api/v1/addresses/{code} et leur photo),
 *    30 au maximum, les plus récentes ;
 *  - les tuiles de carte déjà affichées (400 au maximum).
 * Ce qui n'est JAMAIS mis en cache : les routes /me, /admin, /auth, toute requête portant un
 * jeton (Authorization) et toute requête autre que GET. Ainsi, aucune donnée privée d'un compte
 * ne reste accessible à une autre personne utilisant le même appareil.
 */
const VERSION = 'v1'
const SHELL = `samaadresse-shell-${VERSION}`
const PUBLIC = `samaadresse-public-${VERSION}`
const TILES = `samaadresse-tiles-${VERSION}`
const SHELL_FILES = ['/', '/index.html', '/manifest.webmanifest', '/samaadresse-mark.svg', '/icons/icon-192.png', '/icons/icon-512.png']
const PUBLIC_ADDRESS = /^\/api\/v1\/addresses\/[A-Za-z0-9-]+(\/photo)?$/
const MAX_PUBLIC = 60 // 30 fiches + 30 photos
const MAX_TILES = 400

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('samaadresse-') && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

/** Réseau d'abord ; en cas d'échec, copie en cache marquée « hors ligne » avec sa date. */
async function publicAddress(request) {
  const cache = await caches.open(PUBLIC)
  try {
    const response = await fetch(request)
    if (response.type === 'opaque') {
      // Photo chargée par une balise <img> d'une autre origine : réponse opaque, gardée telle quelle.
      await cache.put(request, response.clone())
      trim(PUBLIC, MAX_PUBLIC)
    } else if (response.ok) {
      const headers = new Headers(response.headers)
      headers.set('X-SamaAdresse-Cached-At', new Date().toISOString())
      const body = await response.clone().blob()
      // Supprimer puis remettre : l'entrée devient la plus récente (ordre utilisé par trim).
      await cache.delete(request)
      await cache.put(request, new Response(body, { status: response.status, headers }))
      trim(PUBLIC, MAX_PUBLIC)
    } else if (response.status === 404) {
      // Adresse retirée ou rendue privée : on oublie aussi la copie locale.
      await cache.delete(request)
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (!cached) throw error
    if (cached.type === 'opaque') return cached
    const headers = new Headers(cached.headers)
    headers.set('X-SamaAdresse-Offline', cached.headers.get('X-SamaAdresse-Cached-At') || new Date().toISOString())
    // L'API est sur une autre origine : l'en-tête doit être explicitement exposé à la page (CORS).
    headers.set('Access-Control-Expose-Headers', 'X-SamaAdresse-Offline')
    return new Response(await cached.blob(), { status: cached.status, headers })
  }
}

async function tile(request) {
  const cache = await caches.open(TILES)
  const cached = await cache.match(request.url, { ignoreVary: true })
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') {
    await cache.put(request.url, response.clone())
    trim(TILES, MAX_TILES)
  }
  return response
}

/** Application : réseau d'abord pour la page (mises à jour), cache d'abord pour les fichiers versionnés. */
async function shell(request) {
  const cache = await caches.open(SHELL)
  if (request.mode === 'navigate') {
    try {
      const response = await fetch(request)
      if (response.ok) cache.put('/index.html', response.clone())
      return response
    } catch {
      return (await cache.match('/index.html')) || Response.error()
    }
  }
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && new URL(request.url).pathname.startsWith('/assets/')) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('Authorization')) return
  const url = new URL(request.url)
  if (PUBLIC_ADDRESS.test(url.pathname) && !url.search) {
    event.respondWith(publicAddress(request))
  } else if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(tile(request))
  } else if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(shell(request))
  }
})
