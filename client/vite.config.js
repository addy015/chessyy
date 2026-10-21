import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the React frontend
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network addresses for local device testing
    port: 5173,
    proxy: {
      // Forward WebSocket traffic to the Express backend on port 5000
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Ignore normal disconnects when refreshing the browser
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
      // Forward API requests to Express
      '/api': {
        target: 'http://localhost:5000',
      },
      // Forward health check endpoint
      '/health': {
        target: 'http://localhost:5000',
      },
    },
  },
});
