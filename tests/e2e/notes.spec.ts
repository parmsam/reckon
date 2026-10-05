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
  // The address stays the app's plain URL; notes never appear in it.
  await expect(page).toHaveURL(/\/reckon\/$/);
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(4);
  await expect(items(page).first()).toContainText('Groceries');

  await item(page, 'Welcome to Reckon').locator('.note-open').click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await page.goBack();
  await expect(page.locator('#note-title')).toHaveText('Groceries');
});

test('searches, pins and trashes notes', async ({ page, isMobile }) => {
  await newNote(page, isMobile, '# Taxes\nincome = 50k');
  await openSidebar(page, isMobile);

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('taxes');
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
  await expect(items(page)).toHaveCount(4);
  await item(page, 'Welcome to Reckon').locator('.note-open').click();
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(3);
});

test('share links open read-only and can be saved', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.locator('#toast')).toHaveText('Share link copied');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/reckon\/#\/share\/welcome-to-reckon\/[A-Za-z0-9_-]+$/);

  const shared = await context.newPage();
  await shared.goto(url);
  await expect(shared.locator('.banner')).toContainText('read-only');
  await expect(shared.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(shared.locator('.cm-result').first()).toHaveText('4');
  await shared.locator('.banner').getByRole('button', { name: 'Save a copy' }).click();
  await expect(shared.locator('#toast')).toHaveText('Saved to your notes');
  await expect(shared).toHaveURL(/\/reckon\/$/);
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

test('plain-text links open a read-only preview that can be saved', async ({ page }) => {
  const note = '# From an LLM\nhourly rate = $85/h\n37.5 h × hourly rate\n20% of 50';
  await page.goto(`./#/new?text=${encodeURIComponent(note)}`);
  await expect(page.locator('.banner')).toContainText('A note from a link');
  await expect(page.locator('#note-title')).toHaveText('From an LLM');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.cm-result')).toHaveText(['$85.00/h', '$3,187.50', '10']);
  await page.locator('.banner').getByRole('button', { name: 'Save a copy' }).click();
  await expect(page).toHaveURL(/\/reckon\/$/);
  await expect(page.locator('#note-title')).toHaveText('From an LLM');

  await page.goto('./#/new?text=%E0%A4%A');
  await expect(page.locator('#toast')).toContainText('broken');
});

test('shared notes are explorable: sliders work, nothing is saved', async ({ page }) => {
  const note = '# Budget\nrent = $1,200\nfood = $400\nleft = $3,000 - rent - food';
  await page.goto(`./#/new?text=${encodeURIComponent(note)}`);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  // No cursor in a read-only note, so every slider line shows its handle.
  await expect(page.locator('.cm-slider-handle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Adjust rent with a slider' }).click();
  await page.getByRole('slider', { name: 'Adjust rent' }).fill('1500');
  await expect(page.locator('.cm-line', { hasText: 'left = ' }).locator('.cm-result')).toHaveText(
    '−$300.00$1,100.00',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-line').nth(1)).toContainText('rent = $1,500');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');

  // Nothing was saved, and "Save a copy" keeps the note as it was shared.
  await expect(items(page)).toHaveCount(3);
  await page.locator('.banner').getByRole('button', { name: 'Save a copy' }).click();
  await expect(page).toHaveURL(/\/reckon\/$/);
  await expect(page.locator('.cm-line').nth(1)).toContainText('rent = $1,200');
});

test('choices work in shared notes, from the mouse or keyboard', async ({ page }) => {
  const note = 'fare = car $120 | [train $80] | fly $300\nfare × 2';
  await page.goto(`./#/new?text=${encodeURIComponent(note)}`);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  const option = page.getByRole('button', { name: /^train: click for the next option/ });
  await option.click();
  await expect(page.locator('.cm-result').nth(1)).toHaveText('$600.00');
  const fly = page.getByRole('button', { name: /^fly: click/ });
  await fly.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-result').nth(1)).toHaveText('$240.00');
  await expect(page.getByRole('button', { name: /^car: click/ })).toBeFocused();
  await expect(items(page)).toHaveCount(3);
});

test('the docs page loads and its examples open in the app', async ({ page }) => {
  await page.goto('./docs/');
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await page.locator('#percentages .try').first().click();
  await expect(page.locator('.banner')).toContainText('A note from a link');
  await expect(page.locator('.cm-result').first()).toHaveText('10');
});

test('exports a note with answers as Markdown and HTML', async ({ page }) => {
  await typeNote(page, '# Budget\nrent = 1,200\nrent × 12');
  await page.getByRole('button', { name: 'Download or export note' }).click();
  const menu = page.getByRole('menu', { name: 'Download or export' });
  await expect(menu).toBeVisible();

  let downloadPromise = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Markdown with answers (.md)' }).click();
  let file = await downloadPromise;
  expect(file.suggestedFilename()).toBe('Budget.md');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(await file.path(), 'utf8')).toContain('| rent × 12 | 14,400 |');

  await page.getByRole('button', { name: 'Download or export note' }).click();
  downloadPromise = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Web page with answers (.html)' }).click();
  file = await downloadPromise;
  expect(file.suggestedFilename()).toBe('Budget.html');
  expect(await readFile(await file.path(), 'utf8')).toContain('<td>rent × 12</td><td>14,400</td>');
});

test('the tutorial and examples can be added back', async ({ page, isMobile }) => {
  // Trash the tutorial, then bring it back from the palette.
  await openSidebar(page, isMobile);
  await item(page, 'Welcome to Reckon').hover();
  await page.getByRole('button', { name: 'Move Welcome to Reckon to trash' }).click();
  await expect(page.locator('#note-title')).not.toHaveText('Welcome to Reckon');

  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('tutorial');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Added 1 note');
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');

  // Nothing is duplicated the second time.
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('tutorial');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText(
    'The tutorial and examples are already in your notes',
  );
  await openSidebar(page, isMobile);
  await expect(items(page)).toHaveCount(3);
});

test('note links from another browser explain themselves', async ({ page }) => {
  await page.goto('./#/note/01M44WYGZP5E41PGBPHGRRYWPZ');
  await expect(page.locator('#toast')).toContainText("isn't saved in this browser");
  await expect(page.locator('#note-title')).toHaveText('Welcome to Reckon');
});

test('the address stays the plain app URL while switching notes', async ({ page, isMobile }) => {
  await newNote(page, isMobile, '# Private\nsalary = 90k');
  await expect(page).toHaveURL(/\/reckon\/$/);
  await openSidebar(page, isMobile);
  await item(page, 'Monthly budget').locator('.note-open').click();
  await expect(page.locator('#note-title')).toHaveText('Monthly budget');
  await expect(page).toHaveURL(/\/reckon\/$/);

  // Back and forward still move between notes, and a reload keeps the note.
  await page.goBack();
  await expect(page.locator('#note-title')).toHaveText('Private');
  await page.goForward();
  await expect(page.locator('#note-title')).toHaveText('Monthly budget');
  await page.reload();
  await expect(page.locator('#note-title')).toHaveText('Monthly budget');
  await expect(page).toHaveURL(/\/reckon\/$/);
});
