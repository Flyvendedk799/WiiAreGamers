import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/socket.io': { target: 'http://127.0.0.1:8080', ws: true },
      '/video-stream': { target: 'http://127.0.0.1:8080', ws: true },
      '/mjpeg-stream': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
})
