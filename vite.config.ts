import { fileURLToPath, URL } from 'node:url'
import { Readable } from 'node:stream'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev-only proxy for the Web-to-PDF tool. The browser cannot read an
 * arbitrary site's HTML/CSS/images because of CORS, so the dev server fetches
 * them server-side (servers don't enforce CORS) and hands the body back to
 * the app. This is what makes "works for any site" true during development;
 * the production build falls back to public CORS relays.
 */
function webFetchProxy(): Plugin {
  return {
    name: 'web-fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/__fetch', (req, res, next) => {
        if (req.method !== 'GET') return next()
        const url = new URL(req.url ?? '', 'http://localhost')
        const target = url.searchParams.get('url')
        if (!target) {
          res.statusCode = 400
          res.end('missing url')
          return
        }
        let targetUrl: URL
        try {
          targetUrl = new URL(target)
        } catch {
          res.statusCode = 400
          res.end('bad url')
          return
        }
        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
          res.statusCode = 400
          res.end('unsupported protocol')
          return
        }
        void fetch(targetUrl.toString(), {
          signal: AbortSignal.timeout(20000),
        })
          .then((response) => {
            res.statusCode = response.status
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET')
            const contentType = response.headers.get('content-type')
            if (contentType) res.setHeader('Content-Type', contentType)
            if (!response.body) {
              res.end()
              return
            }
            Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(
              res,
            )
          })
          .catch((err) => {
            if (!res.headersSent) {
              res.statusCode = 502
              res.end('proxy fetch failed')
            }
            console.error('[web-fetch-proxy]', err)
          })
      })
    },
  }
}

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure(proxy) {
          /* The local Python backend is optional in development. When it is
             not running, answer with a clean JSON body instead of a 502 so
             the health check fails gracefully and the console isn't spammed
             with proxy errors on every request. */
          proxy.on('error', (_error, _request, response) => {
            if (response && !response.writableEnded && 'writeHead' in response) {
              response.writeHead(200, { 'Content-Type': 'application/json' })
              response.end(
                JSON.stringify({ status: 'error', error: 'backend unavailable' }),
              )
            }
          })
        },
      },
    },
  },
  plugins: [
    react(),
    webFetchProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ScissorsDoc.svg'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'ScissorsDoc',
        short_name: 'ScissorsDoc',
        description:
          'A document workspace platform for creating, editing and managing documents.',
        theme_color: '#0F172A',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'ScissorsDoc.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
