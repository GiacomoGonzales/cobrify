import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Muestra prompt al usuario cuando hay actualización
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false, // Esperar a que el usuario acepte la actualización
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Cobrify - Sistema de Facturación Electrónica SUNAT',
        short_name: 'Cobrify',
        description: 'Sistema completo de facturación electrónica homologado con SUNAT para negocios en Perú.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0e27',
        theme_color: '#2563eb',
        orientation: 'any',
        scope: '/',
        lang: 'es-PE',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Punto de Venta',
            short_name: 'POS',
            description: 'Abrir punto de venta rápidamente',
            url: '/app/pos',
            icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }]
          },
          {
            name: 'Nueva Venta',
            short_name: 'Venta',
            description: 'Crear nueva venta',
            url: '/app/pos',
            icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }]
          },
          {
            name: 'Clientes',
            short_name: 'Clientes',
            description: 'Ver lista de clientes',
            url: '/app/clientes',
            icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }]
          }
        ]
      },
      devOptions: {
        enabled: false // No activar SW en desarrollo
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Base path: usar '/' para web, './' solo para Capacitor
  base: process.env.CAPACITOR ? './' : '/',
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://apiperu.dev',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // Optimización para apps móviles
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
        }
      }
    }
  },
  esbuild: {
    // Eliminar console.log en producción
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  }
}))
