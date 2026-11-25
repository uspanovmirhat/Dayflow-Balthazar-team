/* Dayflow service worker: shows reminder notifications (local and FCM push) and opens the app on click. */
const SHOWN_CACHE = 'dayflow-shown-notifications'
const SHOWN_TTL_MS = 3 * 24 * 60 * 60 * 1000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const shownRequest = (key) => new Request(`/__shown/${encodeURIComponent(key)}`)

async function alreadyShown(key) {
  if (!key) return false
  const cache = await caches.open(SHOWN_CACHE)
  return Boolean(await cache.match(shownRequest(key)))
}

async function markShown(key) {
  if (!key) return
  const cache = await caches.open(SHOWN_CACHE)
  await cache.put(shownRequest(key), new Response(String(Date.now())))
  // Drop old entries so the cache stays small.
  for (const request of await cache.keys()) {
    const response = await cache.match(request)
    const time = Number(await response?.text())
    if (!Number.isFinite(time) || Date.now() - time > SHOWN_TTL_MS) await cache.delete(request)
  }
}

function readPayload(event) {
  if (!event.data) return {}
  try {
    const json = event.data.json()
    // FCM wraps the message: { data: {...}, notification?: {...}, from, fcmMessageId }.
    return { ...(json.notification ?? {}), ...(json.data ?? {}) }
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  const key = payload.key || ''
  event.waitUntil((async () => {
    // The open app may have shown this reminder already (same key) — then a late push must not alert again.
    if (await alreadyShown(key)) return
    await self.registration.showNotification(payload.title || 'Dayflow', {
      body: payload.body || '',
      tag: key || undefined,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: payload.url || '/?page=reminders', key },
    })
    await markShown(key)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus()
        client.postMessage({ type: 'dayflow:open', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
