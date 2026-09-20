import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/.
// BASE_PATH is set by the deploy workflow; local dev uses '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Brooklyn Morning',
        short_name: 'Morning',
        description: 'Morning edition, to-dos, and groceries.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F1E6',
        theme_color: '#F7F1E6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + fonts precached; data files are fetched at runtime with their own strategies.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        globIgnores: ['**/data/**', '**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Daily edition + lessons: try network, fall back to cache when offline.
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'data', networkTimeoutSeconds: 8, expiration: { maxEntries: 60 } },
          },
          {
            // Product photos from Open Food Facts.
            urlPattern: ({ url }) => url.hostname.endsWith('openfoodfacts.org'),
            handler: 'CacheFirst',
            options: { cacheName: 'off-images', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
