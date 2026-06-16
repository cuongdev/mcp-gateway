import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  base: '/dashboard/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/auth': 'http://localhost:3100',
      '/mcp': 'http://localhost:3100',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
