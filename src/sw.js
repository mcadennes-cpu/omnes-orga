// src/sw.js
// Service worker maison (strategie injectManifest).
// 1) Precache du shell + fallback SPA + cache des polices (etape 17B).
// 2) Reception des notifications push FCM en arriere-plan (etape 17C).

import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

// --- Activation immediate des nouvelles versions ---
self.skipWaiting()
clientsClaim()

// --- Precache du shell ---
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// --- Fallback SPA ---
const navigationHandler = createHandlerBoundToURL('index.html')
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [
      /^\/api/,
      /supabase\.co/,
      /\.(?:png|ico|svg|webmanifest)$/,
    ],
  })
)

// --- Polices Google : feuilles de style (StaleWhileRevalidate) ---
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  })
)

// --- Polices Google : fichiers de police (CacheFirst, 1 an) ---
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
      }),
    ],
  })
)

// --- FCM : notifications push en arriere-plan (etape 17C) ---
// Meme config que src/lib/firebase.js. Valeurs non sensibles (cote client).
// On enveloppe l'init dans un try/catch : si FCM echoue dans un environnement
// non supporte, le reste du service worker (precache, offline) continue de marcher.
try {
  const firebaseApp = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  const messaging = getMessaging(firebaseApp)

  // Declenche quand un message arrive alors que l'app est en arriere-plan ou fermee.
  // On envoie des messages "data-only" depuis le serveur (17D) et on construit
  // nous-memes la notification ici : controle total, pas de doublon.
  onBackgroundMessage(messaging, (payload) => {
    const data = payload.data || {}
    const title = data.title || 'Omnes Orga'
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url || '/' },
    })
  })
} catch (err) {
  console.error('[sw] Init FCM echouee', err)
}

// --- Clic sur une notification : focaliser une fenetre ouverte, sinon en ouvrir une ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
