import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const ARROW = ' => ';
const NONE = '(none)';

/**
 * Each fixture file is evaluated as one document. A line ending in ` => expected` asserts the
 * formatted result of that line; `=> (none)` asserts that the line shows no result.
 */
for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.calc'))) {
  describe(file, () => {
    const lines = readFileSync(join(FIXTURES, file), 'utf8').replace(/\n$/, '').split('\n');
    const cases = lines.map((line, index) => {
      const at = line.lastIndexOf(ARROW);
      return at === -1
        ? { index, source: line }
        : { index, source: line.slice(0, at), expected: line.slice(at + ARROW.length).trim() };
    });
    const results = evaluateDocument(cases.map((c) => c.source).join('\n'), { locale: 'en-US' });

    for (const c of cases) {
      if (c.expected === undefined) continue;
      it(`${c.index + 1}: ${c.source.trim()}`, () => {
        const result = results[c.index]!;
        const expected = c.expected === NONE ? undefined : c.expected;
        expect(result.display, result.error).toBe(expected);
      });
    }
  });
}
