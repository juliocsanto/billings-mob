import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Sentry source maps upload is only active in CI/production builds
// where SENTRY_AUTH_TOKEN is set as a GitHub Secret / Vercel env var.
// In local dev (no token) the sentryVitePlugin is excluded entirely —
// builds remain fast and source maps are not generated.
const hasSentryToken = Boolean(process.env.SENTRY_AUTH_TOKEN);

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
        theme_color: '#37517E',
        background_color: '#F7F8FA',
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
    // Sentry vite plugin — uploads source maps after each production build.
    // Must be the last plugin so Rollup chunk hashes are already final.
    // Plugin is excluded when SENTRY_AUTH_TOKEN is absent (local dev, PR previews).
    ...(hasSentryToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT ?? 'billings-mob',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // Upload source maps for JS assets only — never .map files via CDN
            sourcemaps: {
              assets: './dist/**',
              ignore: ['node_modules'],
              // Delete local source maps after upload so they are never served
              filesToDeleteAfterUpload: './dist/**/*.map',
            },
          }),
        ]
      : []),
  ],

  build: {
    // Source maps are generated only when Sentry will upload them.
    // Without the auth token, no .map files are produced — avoids accidental
    // exposure of source code through public CDN.
    sourcemap: hasSentryToken,
  },

  base: '/',
  define: { global: 'globalThis' },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
});
