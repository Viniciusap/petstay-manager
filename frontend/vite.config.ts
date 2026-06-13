import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3002';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env['PORT'] ?? 5173),
    proxy: {
      '/health': { target: backendUrl, changeOrigin: true },
      '/system/api': { target: backendUrl, changeOrigin: true },
      '^/[a-z0-9][a-z0-9-]*/api': { target: backendUrl, changeOrigin: true },
      '^/[a-z0-9][a-z0-9-]*/uploads': { target: backendUrl, changeOrigin: true },
    },
  },
});
