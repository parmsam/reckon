import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIRST_RUN_NOTES } from '../src/app/welcome';
import { evaluateDocument } from '../src/engine';

const settings = {
  locale: 'en-US',
  now: Date.parse('2026-01-15T12:00:00Z'),
  timeZone: 'America/New_York',
  rates: JSON.parse(readFileSync('tests/fixtures/rates.json', 'utf8')) as Record<string, number>,
};

describe('first-run notes', () => {
  for (const note of FIRST_RUN_NOTES) {
    const title = note.split('\n')[0];
    it(`${title}: every calculation line has an answer`, () => {
      const lines = note.split('\n');
      const results = evaluateDocument(note, settings);
      const missing = lines.filter((_, i) => {
        const kind = results[i]!.kind;
        return kind === 'error' || kind === 'text';
      });
      expect(missing).toEqual([]);
    });
  }

  it('the budget adds up', () => {
    const budget = FIRST_RUN_NOTES[1]!;
    const results = evaluateDocument(budget, settings);
    const answer = (start: string) =>
      results[budget.split('\n').findIndex((l) => l.startsWith(start))]!.display;
    expect(answer('bills')).toBe('$1,855.00');
    expect(answer('everyday')).toBe('$1,030.00');
    expect(answer('left over')).toBe('$1,315.00');
    expect(answer('savings rate')).toBe('31');
    expect(answer('if left over')).toBe('$15,780.00');
  });
});
