import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local'
const APP_BUILD = { id: `${sha}-${Date.now().toString(36)}`, sha }

const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(APP_BUILD) })
  }
})

const offlineMarker = {
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return cachedResponse;
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-Synchron-Cached', '1');
    return new Response(await cachedResponse.blob(), { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
  }
};

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: {
        enabled: true,
      },
      manifest: false,
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,woff,woff2}',
          'favicon*.{ico,png}',
          'android-icon-*.png',
          'maskable-icon-*.png',
          'apple-touch-icon.png',
          'manifest.json',
          'atom-*.{png,ico,json}'
        ],
        globIgnores: ['**/dev-*', '**/staging-*'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: null,
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
                maxAgeSeconds: 30 * 24 * 60 * 60
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
      input: {
        main: path.resolve(__dirname, 'index.html'),
        privacy: path.resolve(__dirname, 'privacy.html')
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'framer-motion', 'date-fns', 'lucide-react']
        }
      }
    }
  },
})
