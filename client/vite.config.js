import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Identifies this build. The client compares it with /version.json to know when a newer deploy is live.
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local'
const APP_BUILD = { id: `${sha}-${Date.now().toString(36)}`, sha }

const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(APP_BUILD) })
  }
})

// A response the service worker serves from its cache (because the network failed) gets this header,
// so the app can show that it's looking at saved data. Serialised into the generated service worker.
const offlineMarker = {
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return cachedResponse;
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-Synchron-Cached', '1');
    return new Response(await cachedResponse.blob(), { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/utils/autoUpdate.js so reloads are coordinated with the version check
      injectRegister: false,
      // public/manifest.json is the app's manifest (linked from index.html), so don't generate a second one
      manifest: false,
      workbox: {
        // Precache the app itself and the icons the browser actually asks for. The many other icon
        // sizes (and the dev/staging sets) are fetched only if something requests them.
        globPatterns: [
          '**/*.{js,css,html,woff,woff2}',
          'favicon*.{ico,png}',
          'android-icon-*.png',
          'maskable-icon-*.png',
          'apple-touch-icon.png',
          'manifest.json'
        ],
        globIgnores: ['**/dev-*', '**/staging-*'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Pages come from the network so opening the app always gets the latest deploy;
        // the cached copy is only used offline or on a very slow connection.
        navigateFallback: null,
        // Without this, '/' resolves to the precached index.html before the network-first route below sees it
        directoryIndex: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              precacheFallback: { fallbackURL: 'index.html' }
            }
          },
          // SBHS data (timetable, notices, calendar, profile): always fresh when online, the last
          // copy when offline. Cleared on sign-out (see logout in services/api.js).
          {
            urlPattern: ({ url, request }) => url.origin === 'https://student.sbhs.net.au' && url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sbhs-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 14 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              plugins: [offlineMarker]
            }
          },
          // This app's own read-only data for the student (awards, Clipboard, Canvas links,
          // preferences, system status). Admin data is never cached.
          {
            urlPattern: ({ url, request, sameOrigin }) => sameOrigin && request.method === 'GET'
              && /^\/api\/(students\/|award-scheme\/|clipboard\/|canvas-links|system\/status|build-notes|users\/[^/]+\/preferences)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 14 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              plugins: [offlineMarker]
            }
          },
          // Fonts: the stylesheet refreshes in the background, the font files never change.
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'font-styles' }
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'framer-motion', 'date-fns', 'lucide-react']
        }
      }
    }
  },
})
