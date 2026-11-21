import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Use the real (case-correct) path as root: on Windows a lower-case drive letter in the
// working directory otherwise makes Rollup bundle some modules (and three.js) twice.
const root = realpathSync.native(fileURLToPath(new URL('.', import.meta.url)));

// GitHub Pages serves the site from /racing-3d/ (dev/preview use the same path).
export default defineConfig({
  root,
  base: '/racing-3d/',
  build: { target: 'es2019', chunkSizeWarningLimit: 900 },
});
