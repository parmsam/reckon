// Checks the built dist/engine.js works on its own in Node (no native Temporal, no DOM).
import assert from 'node:assert/strict';

const engine = await import(new URL('../dist/engine.js', import.meta.url).href);
const lines = engine.evaluate('5 km in miles\nx = 6 * 7\nx / 2\n$30 in EUR\ntoday + 1 day', {
  now: Date.parse('2026-01-15T12:00:00Z'),
  timeZone: 'UTC',
  rates: { EUR: 0.9 },
});
assert.deepEqual(
  lines.map((l) => l.result),
  ['3.1069 mi', '42', '21', '€27.00', 'Fri, Jan 16'],
);
assert.equal(lines[1].variable, 'x');
assert.ok(Object.keys(engine.bundledRates.rates).length > 100);
assert.equal(
  engine.noteLink('20% of $50'),
  'https://parmsam.github.io/reckon/#/new?text=20%25%20of%20%2450',
);
assert.match(engine.toMarkdown('# Budget\nrent = 1200\nrent × 12'), /\| rent × 12 \| 14,400 \|/);
assert.match(engine.toText('5 km in miles'), /5 km in miles {2}→ 3\.1069 mi/);
assert.match(engine.toHtml('1 + 1', { title: 'Sum' }), /<title>Sum<\/title>/);
console.log(`engine.js ${engine.VERSION} OK`);
