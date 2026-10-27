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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SBHS Timetable',
        short_name: 'Timetable',
        description: 'Sydney Boys High School Timetable App',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'https://cdn.iconscout.com/icon/free/png-256/free-react-1-282599.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'https://cdn.iconscout.com/icon/free/png-256/free-react-1-282599.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
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
          {
            urlPattern: /^https:\/\/student\.sbhs\.net\.au\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sbhs-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 5 * 60 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/auth\.sbhs\.net\.au\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sbhs-auth-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
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
