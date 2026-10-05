import { EditorState, type ChangeSpec, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { resultsField } from './results';

/**
 * Answer references: `line3` in a note, shown as a chip with that line's answer. References are
 * plain text, so notes stay portable; the editor keeps them pointing at the same line when lines
 * are added or removed above it, and turns them into the answer itself if their line is deleted.
 */

const REFERENCE = /^line\s*(\d+)$/i;

interface Reference {
  /** Absolute offsets in the document. */
  from: number;
  to: number;
  /** The 1-based line it points at. */
  n: number;
}

/** Every `lineN` reference the engine recognised. */
export function findReferences(state: EditorState): Reference[] {
  const refs: Reference[] = [];
  const results = state.field(resultsField);
  for (let i = 0; i < results.length && i < state.doc.lines; i++) {
    const line = state.doc.line(i + 1);
    for (const h of results[i]!.highlights) {
      if (h.type !== 'reference') continue;
      const match = REFERENCE.exec(line.text.slice(h.from, h.to));
      if (match) refs.push({ from: line.from + h.from, to: line.from + h.to, n: Number(match[1]) });
    }
  }
  return refs;
}

/** Keeps references on their line as lines come and go above it. */
export const followReferences = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const before = tr.startState;
  const refs = findReferences(before);
  if (!refs.length) return tr;
  const results = before.field(resultsField);
  const deletions: [number, number][] = [];
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (toA > fromA) deletions.push([fromA, toA]);
  });

  const fixes: ChangeSpec[] = [];
  for (const ref of refs) {
    if (ref.n < 1 || ref.n > before.doc.lines) continue;
    // Leave references the change itself touched.
    const from = tr.changes.mapPos(ref.from, 1);
    const to = tr.changes.mapPos(ref.to, -1);
    const text = before.doc.sliceString(ref.from, ref.to);
    if (tr.newDoc.sliceString(from, to) !== text) continue;

    const target = before.doc.line(ref.n);
    const deleted =
      target.length > 0 && deletions.some(([a, b]) => a <= target.from && b >= target.to);
    if (deleted) {
      // The line is gone: keep its last answer.
      const answer = results[ref.n - 1]?.display;
      if (answer !== undefined) fixes.push({ from, to, insert: answer });
      continue;
    }
    // Follow the line's end: typing a new line in front of its text moves the text down with it.
    const n = tr.newDoc.lineAt(tr.changes.mapPos(target.to, -1)).number;
    if (n !== ref.n) fixes.push({ from, to, insert: text.replace(/\d+$/, String(n)) });
  }
  return fixes.length ? [tr, { changes: fixes, sequential: true }] : tr;
});

/**
 * Inserts a reference to line `n`: at the cursor when it's on a later line, otherwise on a new
 * line just below line `n`.
 */
export function insertReference(view: EditorView, n: number): boolean {
  const { state } = view;
  if (state.readOnly || n < 1 || n > state.doc.lines) return false;
  const head = state.selection.main;
  const cursorLine = state.doc.lineAt(head.head).number;
  const ref = `line${n}`;
  if (cursorLine > n) {
    const before = state.doc.sliceString(Math.max(0, head.from - 1), head.from);
    const insert = before && !/[\s(]/.test(before) ? ` ${ref}` : ref;
    view.dispatch({
      changes: { from: head.from, to: head.to, insert },
      selection: { anchor: head.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input.reference',
    });
  } else {
    const end = state.doc.line(n).to;
    const insert = `\n${ref}`;
    view.dispatch({
      changes: { from: end, insert },
      selection: { anchor: end + insert.length },
      scrollIntoView: true,
      userEvent: 'input.reference',
    });
  }
  view.focus();
  return true;
}

class ReferenceChip extends WidgetType {
  constructor(
    readonly answer: string,
    readonly n: number,
  ) {
    super();
  }

  eq(other: ReferenceChip): boolean {
    return other.answer === this.answer && other.n === this.n;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-reference-chip';
    el.textContent = this.answer;
    el.title = `The answer on line ${this.n}`;
    el.setAttribute('aria-label', `line ${this.n}: ${this.answer}`);
    return el;
  }
}

function chips(state: EditorState): DecorationSet {
  const results = state.field(resultsField);
  const ranges: Range<Decoration>[] = [];
  for (const ref of findReferences(state)) {
    const answer = results[ref.n - 1]?.display;
    if (answer === undefined) continue;
    ranges.push(
      Decoration.replace({ widget: new ReferenceChip(answer, ref.n) }).range(ref.from, ref.to),
    );
  }
  return Decoration.set(ranges, true);
}

const chipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = chips(view.state);
    }
    update(update: ViewUpdate) {
      if (update.state.field(resultsField) !== update.startState.field(resultsField))
        this.decorations = chips(update.state);
    }
  },
  {
    decorations: (p) => p.decorations,
    // The chip is one unit: the cursor skips it and backspace removes it whole.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

export const answerReferences = [followReferences, chipPlugin];
