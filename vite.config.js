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
          },
          {
            // Catálogo 25 de SUNAT (código de producto). Son 2.4 MB que solo se
            // bajan al abrir el buscador de códigos. Queda fuera del precache
            // —el globPatterns de arriba no incluye json— y se guarda al vuelo:
            // el contenido no cambia salvo que SUNAT publique otra versión, y
            // esa llega con otro nombre de archivo.
            urlPattern: /\/data\/catalogo-producto-sunat-v\d+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sunat-product-catalog',
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      // El manifiesto NO lo genera el plugin: vive a mano en public/manifest.json.
      //
      // Antes se generaban los DOS y el <head> quedaba con dos <link rel="manifest">.
      // El navegador usa el primero —el manual—, asi que el generado no se leia
      // nunca: era una copia mas pobre (sin screenshots, sin el icono maskable de
      // 1024, con la descripcion corta) esperando a que alguien reordenara el head
      // para cambiar el comportamiento en silencio.
      //
      // Ademas el generado SI lo precachea el service worker, y el manual no
      // (globPatterns no incluye json). Eso importa: en los dominios de resellers
      // el manifiesto lo sirve api/manifest.js con su marca, y para llegar ahi la
      // peticion tiene que salir a la red en vez de resolverse desde la cache.
      manifest: false,
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
