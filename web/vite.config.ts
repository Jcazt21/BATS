import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mockApi } from './dev-mocks/mock-api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.BATS_MOCK ? [mockApi()] : [])],
  server: {
    host: true,
    allowedHosts: true,
    // Desarrollo: /api → API local (python -m bats_core api). En producción (Vercel)
    // SPA y API comparten origen, así que el frontend usa rutas relativas en ambos casos.
    proxy: {
      // El motor de Arena (Node) va ANTES que el comodín de la API de Python.
      '/api/motor': { target: process.env.BATS_MOTOR_URL ?? 'http://127.0.0.1:8012', changeOrigin: true },
      '/api': { target: process.env.BATS_API_URL ?? 'http://127.0.0.1:8011', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
