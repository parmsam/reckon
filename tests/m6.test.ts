import { CompletionContext } from '@codemirror/autocomplete';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { filterCommands, fuzzyScore, type Command } from '../src/app/palette';
import { DEFAULT_PREFERENCES, sanitize } from '../src/app/preferences';
import { toggleLineComment } from '../src/editor/commands';
import { reckonCompletions } from '../src/editor/completion';
import {
  adjustingField,
  engineSettings,
  lineChange,
  resultsField,
  setAdjusting,
} from '../src/editor/results';
import { summarize } from '../src/editor/summary';
import { formatLike } from '../src/editor/interactive';
import { D } from '../src/engine/values';
import { change, evaluateDocument } from '../src/engine';
import { vocabulary } from '../src/engine/vocabulary';

describe('preferences', () => {
  it('keeps valid values and drops junk', () => {
    expect(sanitize(undefined)).toEqual(DEFAULT_PREFERENCES);
    const p = sanitize({
      theme: 'dark',
      fontSize: 18,
      precision: 99,
      locale: 'de-DE',
      fetchRates: false,
      evil: 1,
    });
    expect(p).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
      fontSize: 18,
      locale: 'de-DE',
      fetchRates: false,
    });
    expect(sanitize({ theme: 'neon', locale: 'not a locale!', ppi: 1.5 })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });
});

describe('command palette matching', () => {
  const cmd = (label: string, keywords?: string): Command => ({
    id: label,
    label,
    keywords,
    run: () => {},
  });

  it('matches characters in order, preferring word starts', () => {
    expect(fuzzyScore('New note', 'nn')).toBeGreaterThan(0);
    expect(fuzzyScore('New note', 'xyz')).toBe(-1);
    expect(fuzzyScore('Settings', 'set')).toBeGreaterThan(fuzzyScore('Reset to defaults', 'set'));
  });

  it('filters and ranks, using keywords too', () => {
    const commands = [
      cmd('New note'),
      cmd('Settings', 'preferences theme'),
      cmd('Export all notes', 'backup'),
    ];
    expect(filterCommands(commands, 'theme').map((c) => c.label)).toEqual(['Settings']);
    expect(filterCommands(commands, 'backup').map((c) => c.label)).toEqual(['Export all notes']);
    expect(filterCommands(commands, '')).toHaveLength(3);
    // Whole-word matching, not scattered letters.
    const more = [...commands, cmd('Copy the answer on this line'), cmd('Search notes')];
    expect(filterCommands(more, 'note').map((c) => c.label)).toEqual([
      'New note',
      'Search notes',
      'Export all notes',
    ]);
    // Typos still find something.
    expect(filterCommands(more, 'nwnote').map((c) => c.label)[0]).toBe('New note');
  });
});

describe('toggle comment', () => {
  function run(doc: string, from: number, to = from): string {
    let state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
    toggleLineComment({ state, dispatch: (tr) => (state = tr.state) });
    return state.doc.toString();
  }

  it('comments and uncomments the selected lines, skipping blank ones', () => {
    expect(run('a = 1\n\n  b = 2', 0, 13)).toBe('// a = 1\n\n  // b = 2');
    expect(run('// a = 1\n  //b = 2', 0, 18)).toBe('a = 1\n  b = 2');
    expect(run('x', 0)).toBe('// x');
  });
});

describe('autocomplete', () => {
  function complete(doc: string) {
    const state = EditorState.create({ doc, extensions: [engineSettings.of({}), resultsField] });
    return reckonCompletions(new CompletionContext(state, doc.length, false));
  }

  it('offers variables above the cursor with their values first', () => {
    const result = complete('monthly rent = 1,200\nmo');
    expect(result?.options[0]).toMatchObject({ label: 'monthly rent', detail: '= 1,200' });
    expect(result?.options.some((o) => o.label === 'months')).toBe(true);
  });

  it('stays quiet for one letter, in comments and in headings', () => {
    expect(complete('s')).toBeNull();
    expect(complete('// sq')).toBeNull();
    expect(complete('# sq')).toBeNull();
  });

  it('knows functions, units, currencies and date words', () => {
    const labels = new Set(vocabulary().map((w) => w.label));
    for (const word of ['sqrt', 'kilometers', 'euros', 'tomorrow', 'pi'])
      expect(labels.has(word)).toBe(true);
  });
});

describe('total bar summary', () => {
  const state = (doc: string, anchor: number, head = anchor) =>
    EditorState.create({
      doc,
      selection: EditorSelection.range(anchor, head),
      extensions: [engineSettings.of({ locale: 'en-US' }), resultsField],
    });
  const note = '# Groceries\napples: $3\nbread: $2.50\nsum\n\n# Trip\n5 km\n$20';

  it('totals the section around the cursor, leaving out sum lines', () => {
    expect(summarize(state(note, note.indexOf('bread')))).toEqual({
      kind: 'section',
      label: 'Groceries',
      total: '$5.50',
    });
    // On the heading itself: the section below it.
    expect(summarize(state(note, 1))).toMatchObject({ total: '$5.50' });
  });

  it('only totals raw items of one kind, not derived values or counts', () => {
    const split =
      '# Rent split\nrent = $1,850\nutilities = $210\nhousemates = 3\nshare = (rent + utilities) / housemates';
    expect(summarize(state(split, split.indexOf('share')))).toBeUndefined();
    const named = '# Home\nrent = $1,200\nutilities = $150\nrent + utilities';
    expect(summarize(state(named, named.indexOf('utilities')))).toMatchObject({
      total: '$1,350.00',
    });
  });

  it('stays quiet for mixed units, single answers and blank lines', () => {
    expect(summarize(state(note, note.indexOf('5 km')))).toBeUndefined();
    expect(summarize(state('# A\n5', 4))).toBeUndefined();
    expect(summarize(state(note, note.indexOf('\n\n') + 1))).toBeUndefined();
  });

  it('gives sum, average and count for a multi-line selection', () => {
    const doc = '10\n20\n30\ntext';
    expect(summarize(state(doc, 0, doc.length))).toEqual({
      kind: 'selection',
      sum: '60',
      avg: '20',
      count: 3,
    });
  });
});

describe('interactive numbers', () => {
  it('writes adjusted numbers the way the original was written', () => {
    expect(formatLike('1,200', new D(1450))).toBe('1,450');
    expect(formatLike('1,200', new D(12345.6))).toBe('12,346');
    expect(formatLike('4.50', new D(4.75))).toBe('4.75');
    expect(formatLike('3', new D(5))).toBe('5');
    expect(formatLike('1000', new D(1500))).toBe('1500');
  });
});

describe('ghost deltas', () => {
  const settings = { locale: 'en-US', now: Date.UTC(2026, 0, 15, 12), timeZone: 'UTC' };
  const value = (line: string) => evaluateDocument(line, settings)[0]!.value;
  const moved = (a: string, b: string) => change(value(a), value(b), settings);

  it('says how far an answer moved, signed', () => {
    expect(moved('$1,200', '$1,320')).toBe('+$120.00');
    expect(moved('10', '7.5')).toBe('−2.5');
    expect(moved('2 km', '2500 m')).toBe('+500 m');
    expect(moved('20%', '25%')).toBe('+5%');
    expect(moved('Jan 20', 'Jan 17')).toBe('−3 days');
  });

  it('stays quiet when nothing moved or the answers differ in kind', () => {
    expect(moved('$5', '$5')).toBeUndefined();
    expect(moved('5 km', '$5')).toBeUndefined();
    expect(moved('5', '5%')).toBeUndefined();
    expect(moved('1 > 0', '1 < 0')).toBeUndefined();
    expect(change(undefined, value('5'), settings)).toBeUndefined();
  });

  const adjust = (doc: string, edit: { from: number; to: number; insert: string }) => {
    let state = EditorState.create({
      doc,
      extensions: [engineSettings.of(settings), resultsField, adjustingField],
    });
    state = state.update({ effects: setAdjusting.of(state.field(resultsField)) }).state;
    return state.update({ changes: edit, userEvent: 'input.adjust' }).state;
  };

  it('shows changes on every affected line and the total while adjusting', () => {
    const doc = '# Home\nrent = $1,200\nutilities = $150\nrent × 12';
    const state = adjust(doc, {
      from: doc.indexOf('1,200'),
      to: doc.indexOf('1,200') + 5,
      insert: '1,320',
    });
    expect([0, 1, 2, 3].map((i) => lineChange(state, i))).toEqual([
      undefined,
      '+$120.00',
      undefined,
      '+$1,440.00',
    ]);
    expect(summarize(state)).toMatchObject({ total: '$1,470.00', change: '+$120.00' });
  });

  it('forgets the starting point after any other edit, or when the session ends', () => {
    const doc = 'x = 5\nx * 2';
    let state = adjust(doc, { from: 4, to: 5, insert: '6' });
    expect(lineChange(state, 1)).toBe('+2');
    expect(lineChange(state.update({ effects: setAdjusting.of(null) }).state, 1)).toBeUndefined();
    state = state.update({ changes: { from: 0, insert: 'a' } }).state;
    expect(state.field(adjustingField)).toBeNull();
  });
});
