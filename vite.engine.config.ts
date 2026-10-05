import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** Builds src/api.ts into dist/engine.js: one self-contained ES module for machine use. */
export default defineConfig({
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: { entry: 'src/api.ts', formats: ['es'], fileName: () => 'engine.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
