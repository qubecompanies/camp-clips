import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom subdomain (campclips.qubecompanies.com) serves from root, so base is '/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
