// src/sw.js
// Service worker maison (strategie injectManifest).
// Reproduit fidelement le comportement genere par Workbox en generateSW (etape 12),
// AVANT l'ajout de FCM (etape 17C).

import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

// --- Activation immediate des nouvelles versions ---
// Equivalent de skipWaiting:true + clientsClaim:true en generateSW.
self.skipWaiting()
clientsClaim()

// --- Precache du shell ---
// self.__WB_MANIFEST est remplace au build par la liste des fichiers a precacher
// (construite a partir de injectManifest.globPatterns dans vite.config.js).
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// --- Fallback SPA ---
// Toute navigation vers une URL non precachee renvoie index.html,
// sauf les exceptions de la denylist (API, Supabase, assets binaires).
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
