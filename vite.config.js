import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      devOptions: {
        enabled: true,
        // Sert la navigateFallback en dev aussi.
        // Sans ça on ne peut pas tester la page offline en local.
        navigateFallback: 'index.html',
      },

      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'offline.html',
      ],

      manifest: {
        name: 'Omnès Orga',
        short_name: 'Omnès Orga',
        description: 'Application collaborative du cabinet médical Omnès',
        theme_color: '#1a3a52',
        background_color: '#F5F7F9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        categories: ['medical', 'productivity', 'business'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'screenshot-mobile.png',
            sizes: '776x1689',
            type: 'image/png',
            form_factor: 'narrow',
            label: "Page d'accueil de l'application sur mobile",
          },
          {
            src: 'screenshot-desktop.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
            label: "Page d'accueil de l'application sur desktop",
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

        // Quand l'utilisateur navigue vers une URL non précachée (ex. /trombinoscope/abc
        // en SPA après refresh), on lui sert index.html en fallback (comportement SPA standard).
        navigateFallback: 'index.html',

        // Liste des URLs qui doivent BYPASS le navigateFallback :
        // - tout ce qui ressemble à une API (commence par /api)
        // - les requêtes vers Supabase
        // - les routes nécessitant un téléchargement direct (icônes, manifest)
        navigateFallbackDenylist: [
          /^\/api/,
          /supabase\.co/,
          /\.(?:png|ico|svg|webmanifest)$/,
        ],

        // Stratégies runtime : on définit ici comment traiter les requêtes
        // qui ne sont PAS dans le précache.
        runtimeCaching: [
          // Polices Google : cache long (elles ne changent jamais).
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // ⚠️ AUCUNE règle de runtimeCaching pour Supabase :
          // toutes les requêtes vers *.supabase.co passent par le réseau et
          // ne sont jamais mises en cache. C'est la stratégie "shell uniquement"
          // qu'on a choisie. Hors-ligne, ces requêtes échoueront (erreur réseau
          // standard, l'app React peut afficher son propre état d'erreur).
        ],

        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
