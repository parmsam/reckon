import { defineConfig } from 'vite';

/** Builds src/api.ts into dist/engine.js: one self-contained ES module for machine use. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: { entry: 'src/api.ts', formats: ['es'], fileName: () => 'engine.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
