import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/backend': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/backend/, ''),
      },
      '/api/tts-global': {
        target: 'http://localhost:8003',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/tts-global/, ''),
      },
      '/api/tts-indic': {
        target: 'http://localhost:8004',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/tts-indic/, ''),
      },
      '/api/diarization': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/diarization/, ''),
      },
      '/api/translator': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/translator/, ''),
      },
      '/api/voice-cloner': {
        target: 'http://localhost:8005',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/voice-cloner/, ''),
      },
    },
  },
})
