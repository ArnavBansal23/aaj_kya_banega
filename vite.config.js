import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'Aaj Kya Banega',
        short_name: 'Aaj Kya Banega',
        description: 'Aaj ke ghar ke khaane ke liye ek simple idea.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#f5f3eb',
        background_color: '#f5f3eb',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Keep the development worker from caching the app shell or Vite modules.
        navigateFallback: command === 'serve' ? undefined : 'index.html',
      },
      devOptions: {
        enabled: true,
        // Workbox uses an empty placeholder in dev instead of precaching Vite files.
        suppressWarnings: true,
        disableRuntimeConfig: true,
      },
    }),
  ],
}))
