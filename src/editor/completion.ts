import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { vocabulary } from '../engine/vocabulary';
import { resultsField } from './results';

const WORD = /[\p{L}_][\p{L}\p{N}_]*/u;

let vocabularyOptions: Completion[] | undefined;
function vocabularyCompletions(): Completion[] {
  vocabularyOptions ??= vocabulary().map((w) => ({
    label: w.label,
    type: w.type === 'unit' || w.type === 'currency' ? 'type' : w.type === 'date' ? 'enum' : w.type,
    detail: w.detail,
  }));
  return vocabularyOptions;
}

/** Variables defined above the cursor (with their current values), then everything Reckon knows. */
export function reckonCompletions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(WORD);
  if (!word || (!ctx.explicit && word.to - word.from < 2)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  // Not inside comments or headings.
  if (/^\s*#/.test(before) || before.includes('//')) return null;

  const results = ctx.state.field(resultsField);
  const variables = new Map<string, Completion>();
  for (let i = line.number - 2; i >= 0; i--) {
    const r = results[i];
    if (r?.variable && r.display !== undefined && !variables.has(r.variable)) {
      variables.set(r.variable, {
        label: r.variable,
        type: 'variable',
        detail: `= ${r.display}`,
        boost: 2,
      });
    }
  }
  // Match from the start of a word ("mon" finds "monthly rent" and "monday", not "micron").
  const typed = ctx.state.sliceDoc(word.from, word.to).toLowerCase();
  const startsWith = (label: string) =>
    label
      .toLowerCase()
      .split(' ')
      .some((part) => part.startsWith(typed));
  const options = [...variables.values(), ...vocabularyCompletions()].filter(
    (o) => o.label.toLowerCase() !== typed && startsWith(o.label),
  );
  return options.length ? { from: word.from, options, filter: false } : null;
}

/**
 * Autocomplete that never steals Enter: Tab accepts, arrows move, Escape closes, and
 * Ctrl-Space opens it on demand. Enter always starts a new line.
 */
export const completion = [
  autocompletion({
    override: [reckonCompletions],
    defaultKeymap: false,
    icons: false,
    maxRenderedOptions: 30,
  }),
  Prec.high(
    keymap.of([
      { key: 'Tab', run: acceptCompletion },
      { key: 'ArrowDown', run: moveCompletionSelection(true) },
      { key: 'ArrowUp', run: moveCompletionSelection(false) },
      { key: 'Escape', run: closeCompletion },
      { key: 'Ctrl-Space', run: startCompletion },
    ]),
  ),
];
