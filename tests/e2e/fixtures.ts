import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** Fixed rates for browser tests, so they never depend on outside services. */
export const RATES = { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 };

export const test = base.extend({
  page: async ({ page }, use) => {
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
