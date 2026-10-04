import { describe, expect, it } from 'vitest';
import { deriveTitle } from '../src/app/title';

describe('deriveTitle', () => {
  it('prefers the first heading', () => {
    expect(deriveTitle('rent = 1200\n# Budget\nsum')).toBe('Budget');
  });

  it('falls back to the first non-empty, non-comment line', () => {
    expect(deriveTitle('\n// scratch\n  5 km in miles\n')).toBe('5 km in miles');
  });

  it('returns Untitled for empty notes', () => {
    expect(deriveTitle('  \n// only a comment')).toBe('Untitled');
  });

  it('truncates long titles', () => {
    const title = deriveTitle('x'.repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });
});
