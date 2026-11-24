import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@polyblue/shared': path.resolve(__dirname, '../shared/src/index.ts')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4720',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:4720',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
