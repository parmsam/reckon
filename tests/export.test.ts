import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';
import { toHtml, toMarkdown, toText } from '../src/export';

const note = `# Trip budget
// Two people, three nights
flights: 420 × 2
hotel = 3 × 135
sum

tip | split: 20 / 2`;
const results = evaluateDocument(note);

describe('export', () => {
  it('aligns answers in text', () => {
    const lines = toText(note, results).split('\n');
    expect(lines[0]).toBe('# Trip budget');
    expect(lines[2]).toMatch(/^flights: 420 × 2 +→ 840$/);
    const columns = lines.filter((l) => l.includes('→')).map((l) => [...l].indexOf('→'));
    expect(columns).toHaveLength(4);
    expect(new Set(columns).size).toBe(1);
  });

  it('turns headings, comments and calculations into Markdown', () => {
    expect(toMarkdown(note, results)).toBe(`# Trip budget

Two people, three nights

| Line | Answer |
|---|---:|
| flights: 420 × 2 | 840 |
| hotel = 3 × 135 | 405 |
| sum | 1,245 |

| Line | Answer |
|---|---:|
| tip \\| split: 20 / 2 | 10 |
`);
  });

  it('makes a standalone, escaped HTML page', () => {
    const html = toHtml('# A <b>\n1 + 1', evaluateDocument('# A <b>\n1 + 1'), 'Fish & chips');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Fish &amp; chips</title>');
    expect(html).toContain('<h1>A &lt;b&gt;</h1>');
    expect(html).toContain('<tr><td>1 + 1</td><td>2</td></tr>');
  });
});
