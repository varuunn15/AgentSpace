import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = (target) => ({
    target,
    changeOrigin: true,
    secure: false,
    configure: (proxy) => {
      proxy.on('error', (err) => console.log('proxy error', err))
      proxy.on('proxyReq', (_, req) => console.log('proxying:', req.method, req.url))
      proxy.on('proxyRes', (res, req) => console.log('got response:', res.statusCode, req.url))
    }
  })
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
      hmr: {
        // Stabilise HMR — prevents reloads triggered by unrelated socket errors.
        clientPort: 5173,
      },
      proxy: {
        "/api/sandbox": apiProxy(env.VITE_SANDBOX_API_TARGET || "http://127.0.0.1:3000"),
        "/api/auth": apiProxy(env.VITE_AUTH_API_TARGET || "http://127.0.0.1:3001"),
        "/api/ai": apiProxy(env.VITE_AI_API_TARGET || "http://127.0.0.1:3002")
      }
    }
  }
})
