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

test('first run opens the tutorial, with two example notes', async ({ page, isMobile }) => {
  await page.goto('./');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await expect(resultOnLine(page, '20% of 50')).toHaveText('10');
  // "# 3. Add things up": coffee + lunch + dinner.
  await expect(resultAt(page, 21)).toHaveText('$44.50');
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  await expect(page.locator('.note-item')).toHaveText([
    /Welcome to Reckon/,
    /Monthly budget/,
    /Weekend in Lisbon/,
  ]);
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

test.describe('dates', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('uses the browser clock and time zone', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-15T17:00:00Z'));
    await page.goto('./');
    await setNote(page, 'today\nnow in Tokyo\ndays until Jan 31');
    await expect(resultOnLine(page, 'today')).toHaveText('Thu, Jan 15');
    await expect(resultOnLine(page, 'Tokyo')).toHaveText('Fri, Jan 16, 2:00 AM GMT+9');
    await expect(resultOnLine(page, 'until')).toHaveText('16 days');
    await expect(page.locator('.cm-tok-date', { hasText: 'Jan 31' })).toBeVisible();
  });

  test('loads the Temporal polyfill when the browser has none', async ({ page }) => {
    await page.addInitScript(() => {
      delete (globalThis as { Temporal?: unknown }).Temporal;
    });
    await page.clock.setFixedTime(new Date('2026-01-15T17:00:00Z'));
    await page.goto('./');
    await setNote(page, 'tomorrow');
    await expect(resultOnLine(page, 'tomorrow')).toHaveText('Fri, Jan 16');
  });
});
