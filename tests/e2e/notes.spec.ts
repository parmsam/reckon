import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const editor = (page: Page) => page.locator('.cm-content');
const items = (page: Page) => page.locator('.note-item');
const item = (page: Page, title: string) => page.locator('.note-item', { hasText: title });

/** On phones the notes list is a drawer behind the menu button. */
async function openSidebar(page: Page, isMobile: boolean) {
  if (isMobile && !(await page.locator('.app.drawer-open').count())) {
    await page.getByRole('button', { name: 'Toggle notes list' }).click();
  }
  if (isMobile) await expect(page.locator('.sidebar')).toBeInViewport({ ratio: 1 });
}

async function typeNote(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
  await expect(page.locator('#save-status')).toHaveText('Saved');
}

async function newNote(page: Page, isMobile: boolean, text: string) {
  await openSidebar(page, isMobile);
  await page.getByRole('button', { name: 'New note' }).click();
  await typeNote(page, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
});

test('creates notes and switches between them', async ({ page, isMobile }) => {
  await newNote(page, isMobile, '# Groceries\nmilk = 2.5');
  await expect(page).toHaveURL(/#\/note\/[0-9A-Z]{26}$/);
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).first()).toContainText('Groceries');

  await item(page, 'Welcome to Reckon').locator('.note-open').click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await page.goBack();
  await expect(page.locator('#note-title')).toHaveText('Groceries');
});

test('searches, pins and trashes notes', async ({ page, isMobile }) => {
  await newNote(page, isMobile, '# Taxes\nincome = 50k');
  await openSidebar(page, isMobile);

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('income');
  await expect(items(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('');

  await item(page, 'Welcome to Reckon').hover();
  await page.getByRole('button', { name: 'Pin Welcome to Reckon' }).click();
  await expect(items(page).first()).toContainText('Welcome to Reckon');

  await item(page, 'Taxes').hover();
  await page.getByRole('button', { name: 'Move Taxes to trash' }).click();
  await expect(page.locator('#toast')).toContainText('Moved to trash');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#note-title')).toHaveText('Taxes');

  await openSidebar(page, isMobile);
  await item(page, 'Taxes').hover();
  await page.getByRole('button', { name: 'Move Taxes to trash' }).click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await openSidebar(page, isMobile);
  await page.getByRole('button', { name: 'Trash (1)' }).click();
  await item(page, 'Taxes').locator('.note-open').click();
  await expect(page.locator('.banner')).toContainText('in the trash');
  await page.locator('.banner').getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.banner')).toBeHidden();
  await typeNote(page, '# Taxes\nincome = 60k');
});

test('discards untouched empty notes', async ({ page, isMobile }) => {
  await openSidebar(page, isMobile);
  await page.getByRole('button', { name: 'New note' }).click();
  await expect(page.locator('#note-title')).toHaveText('Untitled');
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(2);
  await item(page, 'Welcome to Reckon').locator('.note-open').click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(1);
});

test('share links open read-only and can be saved', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.locator('#toast')).toHaveText('Share link copied');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/reckon\/#\/share\/[A-Za-z0-9_-]+$/);

  const shared = await context.newPage();
  await shared.goto(url);
  await expect(shared.locator('.banner')).toContainText('read-only');
  await expect(shared.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(shared.locator('.cm-result').first()).toHaveText('$840.00');
  await shared.locator('.banner').getByRole('button', { name: 'Save a copy' }).click();
  await expect(shared.locator('#toast')).toHaveText('Saved to your notes');
  await expect(shared).toHaveURL(/#\/note\//);
  await expect(shared.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
});

test('edits sync to other open tabs', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.locator('#note-title')).toHaveText('Welcome to Reckon');

  await typeNote(page, '# Synced\nx = 6 * 7');
  await expect(other.locator('#note-title')).toHaveText('Synced');
  await expect(other.locator('.cm-result')).toHaveText('42');
});

test('exports a backup and imports it again', async ({ page, isMobile }) => {
  await newNote(page, isMobile, '# Backup me\n1 + 1');
  await openSidebar(page, isMobile);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all notes' }).click();
  const backup = await downloadPromise;
  expect(backup.suggestedFilename()).toMatch(/^reckon-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await backup.path();
  const { readFile } = await import('node:fs/promises');
  const backupFile = {
    name: backup.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(path),
  };

  // Delete the note forever, then bring it back from the backup.
  await item(page, 'Backup me').hover();
  await page.getByRole('button', { name: 'Move Backup me to trash' }).click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await openSidebar(page, isMobile);
  await page.getByRole('button', { name: 'Trash (1)' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Empty trash' }).click();
  await page.getByRole('button', { name: '← Notes' }).click();
  await expect(item(page, 'Backup me')).toHaveCount(0);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import notes' }).click();
  await (await chooserPromise).setFiles(backupFile);
  await expect(page.locator('#toast')).toHaveText('Imported 1 note');
  await expect(item(page, 'Backup me')).toHaveCount(1);
});
