import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
  }
})
