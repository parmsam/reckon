import type { StateCommand } from '@codemirror/state';

/** Mod-/: comments out the selected lines with `// `, or uncomments them if all are comments. */
export const toggleLineComment: StateCommand = ({ state, dispatch }) => {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) numbers.add(n);
  }
  let lines = [...numbers].map((n) => state.doc.line(n));
  if (lines.length > 1) lines = lines.filter((l) => l.text.trim() !== '');
  if (!lines.length) return false;

  const commented = lines.every((l) => /^\s*\/\//.test(l.text));
  const changes = lines.map((l) => {
    const indent = /^\s*/.exec(l.text)![0].length;
    if (!commented) return { from: l.from + indent, insert: '// ' };
    const marker = /^\/\/ ?/.exec(l.text.slice(indent))![0];
    return { from: l.from + indent, to: l.from + indent + marker.length };
  });
  dispatch(
    state.update({ changes, scrollIntoView: true, userEvent: commented ? 'uncomment' : 'comment' }),
  );
  return true;
};

/**
 * Puts `subtotal` on the cursor's line when it's blank, or on a new line below it. The phone
 * keyboard row's Σ key, and double-clicking a blank line under an answer.
 */
export const insertSubtotal: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  const blank = line.text.trim() === '';
  const from = blank ? line.from : line.to;
  const insert = blank ? 'subtotal' : '\nsubtotal';
  dispatch(
    state.update({
      changes: { from, to: line.to, insert },
      selection: { anchor: from + insert.length },
      scrollIntoView: true,
      userEvent: 'input.subtotal',
    }),
  );
  return true;
};
