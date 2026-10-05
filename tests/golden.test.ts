import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const ARROW = ' => ';
const NONE = '(none)';
/** Fixed exchange rates (units per USD), so currency fixtures are deterministic. */
/** Fixed clock for date fixtures: Thursday, Jan 15, 2026, 12:00 UTC. */
const NOW = Date.parse('2026-01-15T12:00:00Z');
const RATES = JSON.parse(readFileSync(join(FIXTURES, 'rates.json'), 'utf8')) as Record<
  string,
  number
>;

/** Templates for the docs: one note per file, each its own document. */
const TEMPLATES = join(FIXTURES, 'templates');

/**
 * Each fixture file (and each template) is evaluated as one document. A line ending in ` => expected` asserts the
 * formatted result of that line; `=> (none)` asserts that the line shows no result. Currency
 * fixtures use the fixed rates in rates.json.
 */
const files = [
  ...readdirSync(FIXTURES).map((f) => join(FIXTURES, f)),
  ...readdirSync(TEMPLATES).map((f) => join(TEMPLATES, f)),
].filter((f) => f.endsWith('.calc'));

for (const path of files) {
  describe(path.slice(FIXTURES.length + 1), () => {
    const lines = readFileSync(path, 'utf8').replace(/\n$/, '').split('\n');
    const cases = lines.map((line, index) => {
      const at = line.lastIndexOf(ARROW);
      return at === -1
        ? { index, source: line }
        : { index, source: line.slice(0, at), expected: line.slice(at + ARROW.length).trim() };
    });
    const results = evaluateDocument(cases.map((c) => c.source).join('\n'), {
      locale: 'en-US',
      rates: RATES,
      now: NOW,
      timeZone: 'UTC',
    });

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
