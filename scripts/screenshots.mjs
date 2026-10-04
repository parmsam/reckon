// Regenerates the README screenshots in docs/. Run with `npm run screenshots`.
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const PORT = 4175;
const NOTES = [
  `# Groceries
apples: 6 × 0.45
milk = 2.49
bread: 3.25
sum`,
  `# Trip budget
flights: 420 × 2
hotel = 3 nights × 135
food: 25% of hotel
sum`,
  `# Freelance invoice
hourly rate = 85

design: 12.5 hours × hourly rate
development: 31 hours × hourly rate
meetings: 4.5 hours × hourly rate
subtotal = sum
discounted = 10% off subtotal
tax = 8.25% of discounted
total due = discounted + tax

# Quick math
monthly savings = 1.2k
monthly savings × 12 // per year
5 as % of 40
round(sqrt(2) × 100, 2)
255 in hex`,
];

const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 680 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/reckon/`);
    await page.locator('.cm-result').first().waitFor();
    // Replace the welcome note so the list only shows the demo notes.
    for (const [i, body] of NOTES.entries()) {
      if (i > 0) await page.getByRole('button', { name: 'New note' }).click();
      await page.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(body);
      await page.locator('#save-status', { hasText: 'Saved' }).waitFor();
    }
    await page.keyboard.press('ControlOrMeta+Home');
    await page.mouse.move(1000, 650);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshot-${scheme}.png` });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
