import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Every supported browser reads WOFF2, so drop the WOFF fallbacks Fontsource lists.
const woff2Only: Plugin = {
  name: 'woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('@fontsource/') || !id.endsWith('.css')) return;
    return code.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '');
  },
};

export default defineConfig({
  base: './',
  plugins: [woff2Only, react()],
  build: {
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, 'index.html'),
        guide: resolve(import.meta.dirname, 'guide/index.html'),
      },
    },
  },
});
