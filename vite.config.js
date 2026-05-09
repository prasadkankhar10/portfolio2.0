import { defineConfig } from 'vite';

export default defineConfig({
  base: '/portfolio2.0/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000
  }
});
