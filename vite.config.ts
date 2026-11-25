import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' lets the same build work on any path (e.g. GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      manifest: {
        name: 'Improve English',
        short_name: 'Improve',
        description: 'A1→C1 ingilis dili sözləri, FSRS ilə təkrar',
        lang: 'az',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b7a5a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + word lists are cached up front, so the app works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // Audio is cached the first time each clip plays (all levels together would be ~200 MB).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio',
              expiration: { maxEntries: 20000 },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
})
