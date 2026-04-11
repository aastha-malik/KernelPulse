import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'frontend/web/react-src',
  plugins: [react()],
  build: {
    outDir: '../../../frontend/web/app',
    // true = wipes old Angular files before each build (safe for Docker
    // and local dev; the outDir is outside Vite's root so this must be
    // explicit)
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/server': 'http://localhost:8080',
      '/websocket': 'http://localhost:8080',
      '/api': 'http://localhost:8080'
    }
  }
})
