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
      // New versions wait until the user chooses to reload (see src/app/updates.ts).
      registerType: 'prompt',
      // Registered from the app (src/app/updates.ts), after the first paint.
      injectRegister: false,
      // Icon links are written in index.html, SVG first: with the plugin's .ico-first links, iOS Safari's tab view showed GitHub's icon.
      pwaAssets: { config: true, includeHtmlHeadLinks: false },
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
        // Take control on first install; later versions wait for the user's Reload.
        clientsClaim: true,
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
