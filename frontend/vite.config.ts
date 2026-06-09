import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3002';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env['PORT'] ?? 5173),
    proxy: {
      '/api': { target: backendUrl, changeOrigin: true },
      '/uploads': { target: backendUrl, changeOrigin: true },
    },
  },
});
