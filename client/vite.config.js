import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Gracefully ignore benign browser refresh TCP resets
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
            console.error('[vite] ws proxy error:', err.message);
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
              console.error('[vite] ws socket error:', err.message);
            });
          });
        },
      },
      '/api': {
        target: 'http://localhost:5000',
      },
      '/health': {
        target: 'http://localhost:5000',
      },
    },
  },
});
