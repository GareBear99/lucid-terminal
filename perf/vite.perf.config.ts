/**
 * Vite config for the splash perf harness only. Builds perf/splash.html
 * (and the real SplashScreen component) into dist-perf/ in production
 * mode, so the measured numbers reflect what the app ships — not the
 * slower dev server. The app's own vite.config.ts is untouched.
 *
 * Usage: npx vite build -c perf/vite.perf.config.ts
 * (or perf/measure-splash.mjs, which runs this for you)
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(perfDir, '..');

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  build: {
    outDir: path.join(repoRoot, 'dist-perf'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(perfDir, 'splash.html'),
    },
  },
});
