import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';
import { MONTHS, TODAY_WORDS, WEEKDAYS, ZONE_ABBREVIATIONS } from '../src/engine/dates';
import { CONSTANTS, FUNCTION_ALIASES, FUNCTIONS } from '../src/engine/functions';
import { FUNCTION_DOCS, glossary, unitCatalog } from '../src/engine/glossary';
import { FRACTIONS, SUFFIXES } from '../src/engine/lexer';
import {
  AGGREGATES,
  CONVERSIONS,
  OP_WORDS,
  PERCENT_WORDS,
  PREV_WORDS,
  SCALES,
  TARGETS,
} from '../src/engine/resolve';
import { CRYPTO, UNIT_SPECS } from '../src/engine/units';
import { SYMBOLS } from '../src/engine/units/currency';

const settings = {
  locale: 'en-US',
  now: Date.parse('2026-01-15T12:00:00Z'),
  timeZone: 'UTC',
  rates: JSON.parse(readFileSync('tests/fixtures/rates.json', 'utf8')) as Record<string, number>,
};

const groups = glossary();
const entries = groups.flatMap((g) => g.entries);
/** Every word and symbol mentioned anywhere in the glossary. */
const mentioned = new Set(
  entries
    .flatMap((e) => e.terms.flatMap((t) => [t, ...t.split(/[\s…]+/)]))
    .map((t) => t.toLowerCase()),
);

describe('glossary', () => {
  it('has an answer for every example', () => {
    for (const e of entries.filter((e) => e.example)) {
      const results = evaluateDocument(e.example!, settings);
      expect(results.at(-1)!.display, `${e.terms[0]}: ${e.example}`).toBeDefined();
    }
  });

  it('describes every function', () => {
    for (const name of Object.keys(FUNCTIONS)) expect(FUNCTION_DOCS[name], name).toBeDefined();
    expect(entries.every((e) => e.meaning)).toBe(true);
  });

  it('lists every word and symbol the parser understands', () => {
    const words = [
      ...Object.keys(OP_WORDS),
      ...CONVERSIONS,
      ...Object.keys(TARGETS),
      ...PERCENT_WORDS,
      ...Object.keys(SCALES),
      ...Object.keys(AGGREGATES),
      ...PREV_WORDS,
      ...Object.keys(FUNCTIONS),
      ...Object.keys(FUNCTION_ALIASES),
      ...Object.keys(CONSTANTS),
      ...Object.keys(MONTHS),
      ...Object.keys(WEEKDAYS),
      ...Object.keys(TODAY_WORDS),
      ...Object.keys(ZONE_ABBREVIATIONS),
      ...Object.keys(SYMBOLS),
      ...Object.keys(CRYPTO),
      ...Object.keys(SUFFIXES),
      ...Object.keys(FRACTIONS),
      // Words resolve.ts and dates.ts handle directly.
      ...'x per of off on is what ago later from until till since at noon midday midnight next last this line time now in min by'.split(
        ' ',
      ),
    ];
    const missing = words.filter((w) => !mentioned.has(w.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('puts every physical unit in a kind', () => {
    const listed = unitCatalog().flatMap((k) => k.units.map((u) => u.symbol));
    const physical = UNIT_SPECS.filter((s) => !s.def.currency && !s.def.crypto).map(
      (s) => s.def.symbol,
    );
    expect(listed.sort()).toEqual(physical.sort());
  });
});
