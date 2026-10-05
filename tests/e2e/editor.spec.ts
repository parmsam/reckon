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
  await resultOnLine(page, '$30 in EUR').hover();
  await expect(page.getByRole('tooltip')).toContainText('Exchange rates from');
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

test('the total bar shows the section total, and selection sums', async ({ page }) => {
  await page.goto('./');
  await setNote(page, '# Groceries\napples: $3\nbread: $2.50\nmilk: $1.25');
  const bar = page.getByRole('contentinfo', { name: 'Totals' });
  await expect(bar).toContainText('Groceries');
  await expect(bar).toContainText('Total $6.75');

  await page.keyboard.press('ControlOrMeta+a');
  await expect(bar).toContainText('3 answers selected');
  await expect(bar).toContainText('Sum $6.75');
  await expect(bar).toContainText('Average $2.25');
});

test('answers explain themselves, and lines show what they use', async ({ page }) => {
  await page.goto('./');
  await setNote(
    page,
    'rent = $1,200\nutilities = $150\nrent + utilities\ntrip cost + 1\n5 km in miles',
  );

  // Hovering an answer shows how the line was read.
  await resultOnLine(page, 'rent + utilities').hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('rent ($1,200.00) + utilities ($150.00)');
  await expect(tip).toContainText('Uses lines 1, 2');
  await resultOnLine(page, '5 km in miles').hover();
  await expect(tip).toContainText('1 km = 0.6214 mi');

  // A line without an answer gets a "?" once the cursor leaves it.
  await page.locator('.cm-line', { hasText: 'rent + utilities' }).click();
  const why = page.locator('.cm-line', { hasText: 'trip cost' }).locator('.cm-why');
  await expect(why).toBeVisible();
  await why.hover();
  await expect(tip).toContainText('No answer');

  // The cursor's line marks what it uses and what uses it.
  await expect(page.locator('.cm-line.cm-uses')).toHaveCount(2);
  await page.locator('.cm-line', { hasText: 'rent = ' }).click();
  await expect(page.locator('.cm-line.cm-used-by')).toHaveCount(1);
});

test('the slider changes a variable live, as one undo step', async ({ page }) => {
  await page.goto('./');
  await setNote(page, 'rent = $1,200\nrent × 12');
  await page.locator('.cm-line', { hasText: 'rent = ' }).click();
  await page.getByRole('button', { name: 'Adjust rent with a slider' }).click();
  const slider = page.getByRole('slider', { name: 'Adjust rent' });
  await slider.fill('1500');
  await expect(page.locator('.cm-line').first()).toContainText('rent = $1,500');
  // While adjusting, each answer shows how far it moved, and so does the total.
  await expect(resultOnLine(page, 'rent × 12').locator('.cm-result-delta')).toHaveText(
    '+$3,600.00',
  );
  await expect(resultOnLine(page, 'rent × 12').locator('.cm-result-answer')).toHaveText(
    '$18,000.00',
  );
  await page.keyboard.press('Escape');
  await expect(resultOnLine(page, 'rent × 12')).toHaveText('$18,000.00');

  await page.locator('.cm-line', { hasText: 'rent × 12' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-line').first()).toContainText('rent = $1,200');
  await expect(resultOnLine(page, 'rent × 12')).toHaveText('$14,400.00');
});

test('⌥/Alt-drag changes numbers only when turned on', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('./');
  await setNote(page, 'rent = $1,200\nrent × 12');
  const number = page.locator('.cm-tok-number', { hasText: '1,200' });
  const drag = async () => {
    const box = (await number.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
  };

  await drag();
  await expect(page.locator('.cm-line').first()).toContainText('rent = $1,200');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel(/Drag numbers to change them/).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await drag();
  await expect(page.locator('.cm-line').first()).toContainText('rent = $1,210');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-line').first()).toContainText('rent = $1,200');
});

test('sweeping a variable charts every answer that uses it', async ({ page }) => {
  await page.goto('./');
  await setNote(page, 'rent = $1,200\nfood = $400\nleft = $3,000 - rent - food\nfood × 2');
  await page.locator('.cm-line', { hasText: 'rent = ' }).click();
  await page.getByRole('button', { name: 'Adjust rent with a slider' }).click();
  await page.getByLabel('Sweep').check();
  // Only `left` uses rent; the range fields set the slider's range too.
  await expect(page.locator('.cm-sparkline')).toHaveCount(1);
  await expect(
    page.locator('.cm-line', { hasText: 'left = ' }).locator('.cm-sparkline'),
  ).toHaveCount(1);
  await page.getByRole('spinbutton', { name: /^To/ }).fill('5000');
  await page.getByRole('spinbutton', { name: /^To/ }).press('Enter');
  await expect(page.getByRole('slider', { name: 'Adjust rent' })).toHaveAttribute('max', '5000');
  await page.getByRole('slider', { name: 'Adjust rent' }).fill('2000');
  await expect(page.locator('.cm-sparkline-dot')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-sparkline')).toHaveCount(0);
});

test('choices: clicking the current option picks the next one', async ({ page }) => {
  await page.goto('./');
  await setNote(
    page,
    'transport = car | [train] | fly\ntrip = if transport == fly then $300 else $80',
  );
  const first = page.locator('.cm-line').first();
  const option = page.locator('.cm-choice-current');
  await expect(option).toHaveText('train');
  await expect(resultOnLine(page, 'trip = ')).toHaveText('$80.00');

  await option.click();
  await expect(first).toHaveText(/^transport = car \| train \| \[fly\]/);
  await expect(resultOnLine(page, 'trip = ')).toHaveText('$300.00');
  await option.click();
  await expect(first).toHaveText(/^transport = \[car\] \| train \| fly/);
  await option.click({ modifiers: ['Shift'] });
  await expect(first).toHaveText(/^transport = car \| train \| \[fly\]/);

  // Each click is one undo step; the keyboard works too.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(first).toHaveText(/^transport = \[car\] \| train \| fly/);
  await first.click();
  await page.keyboard.press('ControlOrMeta+Shift+Space');
  await expect(first).toHaveText(/^transport = car \| \[train\] \| fly/);
});
