import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/app/router';
import {
  cheatSheet,
  exampleText,
  fill,
  parseReference,
  parseTemplate,
  referenceMarkdown,
} from '../src/docs/generate';
import { decodeLinkText, noteLink } from '../src/links';

describe('note links', () => {
  it('round-trip any text, including symbols that matter in URLs', () => {
    const note = '# Trip 🧳\nflights: $420 × 2\n20% of 50 + 3 & co #1 = ok?';
    const link = noteLink(note);
    expect(link.startsWith('https://parmsam.github.io/reckon/#/new?text=')).toBe(true);
    expect(parseRoute(link.slice(link.indexOf('#')))).toEqual({ kind: 'text', text: note });
  });

  it('forgive hand-encoding slips: raw +, raw %, raw spaces', () => {
    expect(decodeLinkText('2+2%0A20% of 50')).toBe('2+2\n20% of 50');
    expect(parseRoute('#/new?text=5 km in miles')).toEqual({ kind: 'text', text: '5 km in miles' });
  });

  it('reject links without text or with too much of it', () => {
    expect(parseRoute('#/new?note=1')).toEqual({ kind: 'badLink' });
    expect(parseRoute(`#/new?text=${'x'.repeat(100_001)}`)).toEqual({ kind: 'badLink' });
  });
});

describe('docs generation', () => {
  it('reads a template: title, description, and the note without its answers', () => {
    const t = parseTemplate(
      '# Tip\n// Leave a tip.\nbill = $80 => $80.00\ntip: 18% of bill => $14.40\n',
    );
    expect(t.title).toBe('Tip');
    expect(t.description).toBe('Leave a tip.');
    expect(t.text).toBe('# Tip\n// Leave a tip.\nbill = $80\ntip: 18% of bill');
    expect(t.examples.at(-1)).toEqual({ input: 'tip: 18% of bill', result: '$14.40' });
  });

  const sections = parseReference(readFileSync('tests/fixtures/reference.calc', 'utf8'));

  it('reads every section of the reference', () => {
    expect(sections.map((s) => s.title)).toContain('Units');
    expect(sections.every((s) => s.blocks.length > 0)).toBe(true);
    const units = sections.find((s) => s.title === 'Units')!;
    expect(units.description[0]).toMatch(/Convert with in/);
    expect(units.blocks[0]![0]).toEqual({ input: '5 km in miles', result: '3.1069 mi' });
  });

  it('aligns answers in text examples', () => {
    expect(
      exampleText([
        { input: '1 + 1', result: '2' },
        { input: '10 × 10', result: '100' },
      ]),
    ).toBe('1 + 1    → 2\n10 × 10  → 100');
  });

  it('links every example block to a note with exactly its lines', () => {
    const md = referenceMarkdown(sections, noteLink);
    const links = [...md.matchAll(/\[Open in Reckon\]\((.+?)\)/g)].map((m) => m[1]!);
    expect(links).toHaveLength(sections.flatMap((s) => s.blocks).length);
    const first = parseRoute(links[0]!.slice(links[0]!.indexOf('#')));
    expect(first).toEqual({
      kind: 'text',
      text: sections[0]!.blocks[0]!.map((e) => e.input).join('\n'),
    });
  });

  it('builds a cheat sheet and fills templates', () => {
    expect(cheatSheet(sections)).toMatch(/^Basics:\n2 \+ 3 × 4/);
    expect(fill('{{a}} and {{missing}}', { a: 'x' })).toBe('x and {{missing}}');
  });
});
