import { history, redo, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { followReferences } from '../src/editor/references';
import { resultsField } from '../src/editor/results';

const state = (doc: string) =>
  EditorState.create({ doc, extensions: [resultsField, followReferences] });

/** Applies one change and returns the new text. */
function edit(doc: string, change: { from: number; to?: number; insert?: string }): string {
  const s = state(doc);
  return s.update({ changes: change }).state.doc.toString();
}

describe('answer references follow their line', () => {
  const doc = 'rent = 1200\npower = 80\nline1 + line 2';

  it('renumbers when a line is added above the target', () => {
    expect(edit(doc, { from: 0, insert: '# Costs\n' })).toBe(
      '# Costs\nrent = 1200\npower = 80\nline2 + line 3',
    );
  });

  it('renumbers only references below an added line', () => {
    const at = doc.indexOf('power');
    expect(edit(doc, { from: at, insert: '\n' })).toBe('rent = 1200\n\npower = 80\nline1 + line 3');
  });

  it('follows the text when a new line is typed in front of it, one key at a time', () => {
    let s = state(doc);
    let at = 0;
    for (const key of '# Costs\n') s = s.update({ changes: { from: at++, insert: key } }).state;
    expect(s.doc.toString()).toBe('# Costs\nrent = 1200\npower = 80\nline2 + line 3');
  });

  it('stays put when Enter is pressed at the end of the target line', () => {
    expect(edit(doc, { from: doc.indexOf('\n'), insert: '\n' })).toBe(
      'rent = 1200\n\npower = 80\nline1 + line 3',
    );
  });

  it('undo and redo put the references back as they were', () => {
    let s = EditorState.create({ doc, extensions: [history(), resultsField, followReferences] });
    const run = (cmd: typeof undo) =>
      cmd({ state: s, dispatch: (tr: Transaction) => (s = tr.state) });
    s = s.update({ changes: { from: 0, insert: '# Costs\n' } }).state;
    expect(s.doc.toString()).toBe('# Costs\nrent = 1200\npower = 80\nline2 + line 3');
    run(undo);
    expect(s.doc.toString()).toBe(doc);
    run(redo);
    expect(s.doc.toString()).toBe('# Costs\nrent = 1200\npower = 80\nline2 + line 3');
  });

  it('renumbers when a line above is removed', () => {
    const text = '// note\nrent = 1200\nline2 × 2';
    expect(edit(text, { from: 0, to: '// note\n'.length })).toBe('rent = 1200\nline1 × 2');
  });

  it('keeps the last answer when the target line is deleted', () => {
    const from = doc.indexOf('power');
    expect(edit(doc, { from, to: from + 'power = 80\n'.length })).toBe('rent = 1200\nline1 + 80');
  });

  it('leaves references the edit itself changes, and other edits alone', () => {
    const at = doc.indexOf('line 2') + 'line '.length;
    expect(edit(doc, { from: at, to: at + 1, insert: '1' })).toBe(
      'rent = 1200\npower = 80\nline1 + line 1',
    );
    expect(
      edit(doc, { from: doc.indexOf('1200'), to: doc.indexOf('1200') + 4, insert: '900' }),
    ).toBe('rent = 900\npower = 80\nline1 + line 2');
  });
});
