import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The dev server mirrors what nginx does in the container (frontend/nginx.conf),
// so the same relative /api/* paths work in development and production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/chaos': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/chaos/, '/chaos'),
      },
      '/api/orders': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/orders/, '/orders'),
      },
      '/api/mgmt': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mgmt/, '/mgmt'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
