import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/findings': 'http://localhost:8000',
      '/queries': 'http://localhost:8000',
      '/escalations': 'http://localhost:8000',
      '/compliance': 'http://localhost:8000',
      '/trace': 'http://localhost:8000',
      '/memory': 'http://localhost:8000',
      '/review-report': 'http://localhost:8000',
      '/patients': 'http://localhost:8000',
      '/decisions': 'http://localhost:8000',
    },
  },
})
