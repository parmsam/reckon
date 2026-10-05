import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const editor = (page: Page) => page.locator('.cm-content');
const resultOnLine = (page: Page, text: string) =>
  page.locator('.cm-line', { hasText: text }).locator('.cm-result');

async function setNote(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

async function openSettings(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.cm-result').first()).toBeVisible();
});

test('settings change the theme and precision, and persist', async ({ page, isMobile }) => {
  await setNote(page, '1/3');
  await expect(resultOnLine(page, '1/3')).toHaveText('0.3333333333');
  await expect(page.locator('#save-status')).toHaveText('Saved');

  await openSettings(page, isMobile);
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Decimal places', { exact: true }).fill('2');
  await page.getByLabel('Decimal places', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(resultOnLine(page, '1/3')).toHaveText('0.33');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(resultOnLine(page, '1/3')).toHaveText('0.33');
});

test('the command palette runs commands and opens notes', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('new note');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.locator('#note-title')).toHaveText('Untitled');
  await page.keyboard.insertText('# Groceries');

  await page.getByRole('button', { name: /Commands/ }).click();
  await page.keyboard.type('welcome');
  await expect(palette.getByRole('option').first()).toContainText('Welcome to Reckon');
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
});

test('autocomplete suggests variables; Tab accepts and Enter makes a new line', async ({
  page,
}) => {
  await setNote(page, 'monthly rent = 1200\nmon');
  const popup = page.locator('.cm-tooltip-autocomplete');
  await expect(popup).toContainText('monthly rent');
  // CodeMirror ignores accept keys for 75 ms after the popup opens, to prevent accidental picks.
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');
  await expect(page.locator('.cm-line').nth(1)).toContainText('monthly rent');
  await expect(resultOnLine(page, 'monthly rent').nth(1)).toHaveText('1,200');

  await page.keyboard.insertText(' * 12\nmon');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-line')).toHaveCount(4);
});

test('Mod-/ toggles comments', async ({ page }) => {
  await setNote(page, '2 + 2');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(page.locator('.cm-line').first()).toHaveText('// 2 + 2');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(page.locator('.cm-line').first()).toContainText('2 + 2');
  await expect(resultOnLine(page, '2 + 2')).toHaveText('4');
});

test('math keys appear above the phone keyboard', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch screens only');
  const keys = page.getByRole('toolbar', { name: 'Math keys' });
  await expect(keys).toBeHidden();
  await setNote(page, '6');
  await expect(keys).toBeVisible();
  await keys.getByRole('button', { name: 'times' }).click();
  await page.keyboard.insertText('7');
  await expect(resultOnLine(page, '6 × 7')).toHaveText('42');
});

test('works offline after the first visit', async ({ page, context }) => {
  // Wait for the service worker to take control and cache the app.
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.ready;
      const cached = await caches.match('index.html', { ignoreSearch: true });
      return (
        registration.active?.state === 'activated' &&
        Boolean(navigator.serviceWorker.controller) &&
        Boolean(cached)
      );
    },
    undefined,
    { timeout: 15_000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await expect(page.locator('.cm-result').first()).toBeVisible();
  await setNote(page, '5 km in miles');
  await expect(resultOnLine(page, '5 km in miles')).toHaveText('3.1069 mi');
  await context.setOffline(false);
});

test('the keyboard shortcuts dialog opens from the sidebar, the palette and ?', async ({
  page,
  isMobile,
}) => {
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Command palette');
  // Focus starts on Done, not on the docs link.
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('shortcuts');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');

  // `?` outside the editor opens it; inside the editor it's just a character.
  await page.locator('#note-title').click();
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await setNote(page, 'what?');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.cm-line').first()).toHaveText('what?');
});

test('the GitHub link shows once: top bar on wide screens, notes list on phones', async ({
  page,
  isMobile,
}) => {
  const links = page.getByRole('link', { name: /Reckon on GitHub/ });
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  await expect(links).toHaveCount(1);
  await expect(links).toBeVisible();
  await expect(links).toHaveAttribute('href', 'https://github.com/parmsam/reckon');
  const inSidebar = await links.evaluate((el) => Boolean(el.closest('.sidebar')));
  expect(inSidebar).toBe(Boolean(isMobile));
});

test.describe('splash screen', () => {
  test.use({ splash: true });

  test('shows the brand while starting, then gets out of the way; can be turned off', async ({
    page,
    isMobile,
  }) => {
    await page.goto('./');
    const splash = page.locator('#splash');
    await expect(splash).toContainText('Reckon');
    await expect(splash).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.cm-result').first()).toBeVisible();

    await openSettings(page, isMobile);
    await page.getByLabel('Show the splash screen when Reckon opens').uncheck();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await expect(page.locator('#splash')).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/no-splash/);
  });

  test('settings show the version and links', async ({ page, isMobile }) => {
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 5000 });
    await openSettings(page, isMobile);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toContainText('Reckon 1.0.0');
    await expect(dialog.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/parmsam/reckon',
    );
  });
});

test('tips cycle, and are turned off and on in Settings', async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  const tip = page.getByRole('complementary', { name: 'Tip' });
  await expect(tip).toBeVisible();
  const first = await tip.textContent();
  await tip.getByRole('button', { name: 'Next tip' }).click();
  await expect(tip).not.toHaveText(first!);
  await expect(tip.getByRole('button', { name: 'Turn off tips' })).toHaveCount(0);

  // The notes list (with Settings) is already open here, on phones too.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Show tips in the notes list').uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(tip).toBeHidden();

  await page.reload();
  await expect(page.locator('.cm-result').first()).toBeVisible();
  await expect(tip).toBeHidden();
  await openSettings(page, isMobile);
  await page.getByLabel('Show tips in the notes list').check();
  await page.getByRole('button', { name: 'Done' }).click();
  if (isMobile) await page.getByRole('button', { name: 'Toggle notes list' }).click();
  await expect(page.getByRole('complementary', { name: 'Tip' })).toBeVisible();
});
