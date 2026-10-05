import { CompletionContext } from '@codemirror/autocomplete';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { filterCommands, fuzzyScore, type Command } from '../src/app/palette';
import { DEFAULT_PREFERENCES, sanitize } from '../src/app/preferences';
import { toggleLineComment } from '../src/editor/commands';
import { reckonCompletions } from '../src/editor/completion';
import { engineSettings, resultsField } from '../src/editor/results';
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
