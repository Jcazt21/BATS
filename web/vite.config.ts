import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
    // Desarrollo: /api → API local (python -m bats_core api). En producción (Vercel)
    // SPA y API comparten origen, así que el frontend usa rutas relativas en ambos casos.
    proxy: {
      '/api': { target: process.env.BATS_API_URL ?? 'http://localhost:8001', changeOrigin: true },
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
