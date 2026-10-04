import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';

/** Renders highlights as `type:text` pairs for readable assertions. */
function spans(line: string, doc = line): string[] {
  const results = evaluateDocument(doc);
  const result = results[results.length - 1]!;
  return result.highlights.map((h) => `${h.type}:${line.slice(h.from, h.to)}`);
}

describe('highlights', () => {
  it('marks numbers, operators and functions', () => {
    expect(spans('sqrt(16) + 2')).toEqual([
      'function:sqrt',
      'operator:(',
      'number:16',
      'operator:)',
      'operator:+',
      'number:2',
    ]);
  });

  it('marks labels, assignments and inline comments with line offsets', () => {
    expect(spans('Rent: monthly rent = 1,200 // per month')).toEqual([
      'label:Rent:',
      'variable:monthly rent',
      'number:1,200',
      'comment:// per month',
    ]);
  });

  it('marks variable references and keywords, and leaves descriptive text plain', () => {
    expect(spans('tax of 50 apples in hex', 'tax = 8%\ntax of 50 apples in hex')).toEqual([
      'variable:tax',
      'keyword:of',
      'number:50',
      'keyword:in',
      'keyword:hex',
    ]);
  });

  it('marks whole heading and comment lines', () => {
    expect(spans('# Budget')).toEqual(['heading:# Budget']);
    expect(spans('// note')).toEqual(['comment:// note']);
  });

  it('marks references and aggregates', () => {
    expect(spans('sum + prev', '1\nsum + prev')).toEqual([
      'reference:sum',
      'operator:+',
      'reference:prev',
    ]);
  });
});

describe('evaluateDocument performance', () => {
  it('re-evaluates a 2,000-line note quickly after a one-line edit', () => {
    const lines = Array.from({ length: 2000 }, (_, i) =>
      i % 50 === 0 ? `# Section ${i}` : `item ${i}: x${i} = ${i} * 1.5 + 10%`,
    );
    evaluateDocument(lines.join('\n'));
    lines[1000] = 'item edited: 42';
    const start = performance.now();
    const results = evaluateDocument(lines.join('\n'));
    const elapsed = performance.now() - start;
    expect(results[1000]!.display).toBe('42');
    expect(elapsed).toBeLessThan(100);
  });
});
