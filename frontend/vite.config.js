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
    rollupOptions: {
      output: {
        // Recharts and its d3 dependencies dominate the bundle and change far
        // less often than the dashboard code, so splitting them out keeps the
        // app chunk small and cacheable across deploys.
        // Rolldown (Vite 8) requires the function form here.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'charts'
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
