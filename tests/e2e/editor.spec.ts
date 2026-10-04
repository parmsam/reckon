import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const editor = (page: Page) => page.locator('.cm-content');
const resultOnLine = (page: Page, text: string) =>
  page.locator('.cm-line', { hasText: text }).locator('.cm-result');
/** Result on the 1-based line `n`. A line's text includes its result, so match by position. */
const resultAt = (page: Page, n: number) =>
  page
    .locator('.cm-line')
    .nth(n - 1)
    .locator('.cm-result');

/** Replaces the whole note with `text`. */
async function setNote(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

test('first run shows the welcome note with results', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await expect(resultOnLine(page, 'flights: $420 × 2')).toHaveText('$840.00');
  await expect(resultAt(page, 9)).toHaveText('$1,346.25');
});

test('typing updates results and highlighting live', async ({ page }) => {
  await page.goto('./');
  await setNote(page, '# Groceries\napples: 3 * 1.25\nmilk = 2.5\nsum');
  await expect(page.locator('#note-title')).toHaveText('Groceries');
  await expect(resultOnLine(page, 'apples')).toHaveText('3.75');
  await expect(resultAt(page, 4)).toHaveText('6.25');
  await expect(page.locator('.cm-tok-variable', { hasText: 'milk' })).toBeVisible();
  await expect(page.locator('.cm-heading-line')).toHaveText('# Groceries');
});

test('edits persist across reloads', async ({ page }) => {
  await page.goto('./');
  await setNote(page, 'persisted = 6 * 7');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  await page.reload();
  await expect(resultOnLine(page, 'persisted')).toHaveText('42');
});

test('clicking a result copies it', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await setNote(page, '1,000 * 3');
  await resultOnLine(page, '1,000 * 3').click();
  await expect(page.locator('#toast')).toHaveText('Copied 3,000');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('3,000');
});

test('converts units and currencies with live rates', async ({ page }) => {
  await page.goto('./');
  await setNote(page, '5 km in miles\n$30 in EUR\n0.01 BTC in USD');
  await expect(resultOnLine(page, '5 km in miles')).toHaveText('3.1069 mi');
  // Mocked rates: 1 USD = 0.9 EUR, 1 BTC = $100,000.
  await expect(resultOnLine(page, '$30 in EUR')).toHaveText('€27.00');
  await expect(resultOnLine(page, '$30 in EUR')).toHaveAttribute('title', /Exchange rates from/);
  await expect(resultOnLine(page, 'BTC')).toHaveText('$1,000.00');
  await expect(page.locator('.cm-tok-unit', { hasText: 'km' })).toBeVisible();
});
