import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, host: true,
    proxy: {
      '/api/rabbitmq': { target: 'http://localhost:15672', changeOrigin: true,
                         rewrite: p => p.replace(/^\/api\/rabbitmq/, '/api') },
      '/api/chaos':    { target: 'http://localhost:8080',  changeOrigin: true,
                         rewrite: p => p.replace(/^\/api\/chaos/, '')        },
      '/api/orders':   { target: 'http://localhost:8090',  changeOrigin: true,
                         rewrite: p => p.replace(/^\/api\/orders/, '/orders') },
    }
  }
})
