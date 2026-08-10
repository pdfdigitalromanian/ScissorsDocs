import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ScissorsDoc.svg'],
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
