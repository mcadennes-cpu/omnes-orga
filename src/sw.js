// src/sw.js
// Service worker maison (strategie injectManifest).
// 1) Precache du shell + fallback SPA + cache des polices (etape 17B).
// 2) Reception des notifications push FCM en arriere-plan (etape 17C).
// 3) Pose de la pastille (App Badge) a la reception d'un push (etape 18B).

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

// --- Pastille (App Badge) : applique le compteur recu dans le push (18B) ---
// Renvoie une Promise pour pouvoir etre awaitee dans event.waitUntil().
// Feature detection : sur les plateformes sans Badging API, no-op silencieux.
function appliquerBadge(rawBadge) {
  if (!self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve()
  const count = Number(rawBadge)
  if (Number.isFinite(count) && count > 0) {
    return self.navigator.setAppBadge(count).catch(() => {})
  }
  if ('clearAppBadge' in self.navigator) {
    return self.navigator.clearAppBadge().catch(() => {})
  }
  return Promise.resolve()
}

// --- Pastille via l'evenement push BRUT ---
// IMPORTANT iOS : setAppBadge appele DANS le callback onBackgroundMessage de FCM
// n'est pas applique par Safari/iOS (bug connu firebase-js-sdk #8416). On pose
// donc la pastille ici, dans un vrai listener "push", enveloppe dans
// event.waitUntil() pour que iOS garde le SW vivant jusqu'a la mise a jour.
// La notification, elle, reste affichee par onBackgroundMessage ci-dessous
// (pas de doublon : ce listener-ci n'affiche aucune notification).
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    return
  }
  // FCM "data-only" : les champs sont sous payload.data (fallback sur payload).
  const data = payload.data || payload
  if (data && 'badge' in data) {
    event.waitUntil(appliquerBadge(data.badge))
  }
})

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
  // NB : la pastille n'est PAS posee ici (cf. listener "push" plus haut) -- iOS
  // ne l'applique pas depuis ce callback.
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

// --- Clic sur une notification : naviguer vers la carte cible puis focaliser ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  const targetHref = new URL(targetUrl, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Fenetre deja ouverte : la faire naviguer vers la carte cible PUIS
        // la mettre au premier plan. Avant, on faisait focus() sans naviguer,
        // donc on restait la ou on etait (souvent la Home).
        if ('focus' in client) {
          if ('navigate' in client) {
            return client
              .navigate(targetHref)
              .then((navigated) => (navigated || client).focus())
              .catch(() => client.focus())
          }
          return client.focus()
        }
      }
      // App fermee : on ouvre directement la bonne URL.
      if (self.clients.openWindow) return self.clients.openWindow(targetHref)
    })
  )
})
