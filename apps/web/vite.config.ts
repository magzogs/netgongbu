import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built viewer works from any folder or static host.
  base: './',
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    // apps/server (AI scenario generation); `pnpm dev` at the repo root starts both.
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: { port: 5181, strictPort: true },
  // three.js + drei make one ~1 MB vendor chunk; that is expected for a 3D viewer.
  build: { chunkSizeWarningLimit: 1600 },
});
