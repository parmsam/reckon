import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Served from https://parmsam.github.io/reckon/
  base: '/reckon/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Register the service worker without blocking the first paint.
      injectRegister: 'script-defer',
      pwaAssets: { config: true },
      manifest: {
        name: 'Reckon',
        short_name: 'Reckon',
        description: 'A notepad that does the math.',
        theme_color: '#1c1b22',
        background_color: '#1c1b22',
        display: 'standalone',
      },
      workbox: {
        // The plugin adds manifest.webmanifest itself; listing it twice breaks precaching.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Docs and machine-readable files aren't part of the app: don't answer them with index.html.
        navigateFallbackDenylist: [/\/docs\//, /\/skill\//, /\.txt$/, /\.md$/, /\/engine\.js$/],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
