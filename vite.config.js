import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'frontend/react-src',
  plugins: [react()],
  build: {
    outDir: '../../frontend/app',
    emptyOutDir: false,
    // Default hashed filenames — browser always fetches fresh JS after rebuild
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
