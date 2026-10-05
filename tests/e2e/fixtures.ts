import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** Fixed rates for browser tests, so they never depend on outside services. */
export const RATES = { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 };

export const test = base.extend<{ splash: boolean }>({
  /** The splash screen is off in tests, to keep them fast; `test.use({ splash: true })` turns it on. */
  splash: [false, { option: true }],
  page: async ({ page, splash }, use) => {
    if (!splash) await page.addInitScript(() => localStorage.setItem('reckon.splash', 'off'));
    await page.route('https://open.er-api.com/**', (route) =>
      route.fulfill({ json: { result: 'success', rates: RATES } }),
    );
    await page.route('https://api.frankfurter.dev/**', (route) => route.abort());
    await page.route('https://api.coingecko.com/**', (route) =>
      route.fulfill({ json: { bitcoin: { usd: 100000 }, ethereum: { usd: 2000 } } }),
    );
    await use(page);
  },
});
