import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom subdomain (campclips.qubecompanies.com) serves from root, so base is '/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
  // @ffmpeg/ffmpeg loads its web worker via `new URL('./worker.js', import.meta.url)`.
  // esbuild's dep pre-bundling rewrites that URL and breaks the worker, so exclude
  // these from optimizeDeps and let Vite serve them as-is (same-origin). The single-
  // threaded @ffmpeg/core needs no SharedArrayBuffer / COOP-COEP headers.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
