import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server:{
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    // Preview traffic goes through the router's external port, which may
    // differ from Vite's internal listening port.
    hmr: {
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 8080),
    },
  },
  
  watch: {
    usePolling: true,
    interval: 300,
    ignored: ['node_modules']
  },
})
