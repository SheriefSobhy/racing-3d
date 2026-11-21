import { defineConfig } from 'vite';

// GitHub Pages serves the site from /racing-3d/ (dev/preview use the same path).
export default defineConfig({
  base: '/racing-3d/',
  build: { target: 'es2019', chunkSizeWarningLimit: 900 },
});
