import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    VitePWA({
      registerType: 'autoUpdate',
      // Service Worker inlined strategy — no separate SW file needed
      injectRegister: 'auto',
      // Workbox config: cache-first for assets, network-first for API calls
      workbox: {
        // Increase limit to 4MB to accommodate @react-pdf/renderer bundle
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
        // Cache static assets (JS, CSS, fonts, images) — cache-first
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        // Navigation fallback for SPA routing
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Don't intercept Supabase auth callback — it needs network
          /^\/auth\//,
          // Don't intercept API calls — they need network
          /^\/api\//,
        ],
        runtimeCaching: [
          {
            // Google Fonts CSS — stale-while-revalidate
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            // Google Fonts webfonts — cache-first (fonts rarely change)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Supabase API calls — NetworkFirst (offline fallback: cached data)
            // Covers auth token refresh and project URL
            urlPattern: /^https:\/\/gcwxwrjzbbqkuzcweyut\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      // PWA manifest (ADR-001: offline-first PWA)
      manifest: {
        name: 'Billings Gráfico',
        short_name: 'Billings',
        description: 'Registro do Método de Ovulação Billings — app para alunas',
        theme_color: '#8C3C28',
        background_color: '#DDD3C4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        categories: ['health', 'medical'],
      },
      // Dev mode: enable SW in development for testing
      devOptions: {
        enabled: false, // disable in dev to avoid interfering with HMR
      },
    }),
  ],
  base: '/',
  define: { global: 'globalThis' },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
});
