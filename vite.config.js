import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // On ecrit nous-memes le service worker (src/sw.js) au lieu de le laisser
      // generer par Workbox : c'est ce qui permettra d'y greffer FCM en 17C.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',

      registerType: 'autoUpdate',

      devOptions: {
        enabled: true,
        // type: 'module' indispensable : notre src/sw.js utilise des imports ES.
        type: 'module',
        // Sert la navigateFallback en dev aussi (test de la page offline en local).
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

      // En strategie injectManifest, le bloc "workbox" (generateSW) est remplace par
      // "injectManifest". On n'y garde QUE les options de build du precache : la liste
      // des fichiers a precacher. Tout le comportement runtime (fallback SPA, cache des
      // polices, skipWaiting...) est desormais code dans src/sw.js.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
    }),
  ],
})
