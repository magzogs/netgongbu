import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// The renderer is the web viewer (apps/web) itself; the desktop app adds a main process (real
// browser, OS tools, Claude) and a preload bridge. Every dependency is a devDependency, so main
// and preload are bundled into single files and the sandboxed preload needs no Node modules.
const web = resolve(import.meta.dirname, '../web');

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: false },
  },
  renderer: {
    root: web,
    base: './',
    plugins: [react()],
    build: {
      outDir: resolve(import.meta.dirname, 'out/renderer'),
      emptyOutDir: true,
      minify: 'esbuild',
      chunkSizeWarningLimit: 1800,
      rollupOptions: { input: resolve(web, 'index.html') },
    },
  },
});
