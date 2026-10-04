import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Served from https://parmsam.github.io/reckon/
  base: '/reckon/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
