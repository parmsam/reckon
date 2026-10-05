import { EditorView } from '@codemirror/view';

/** Editor chrome. Colors come from CSS variables in styles.css, so both themes work. */
export const reckonTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: 'var(--editor-font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--mono)',
    lineHeight: '1.7',
    // Shaded results column on the right.
    backgroundImage:
      'linear-gradient(to left, var(--results-bg) calc(var(--results-width) + 2rem), transparent calc(var(--results-width) + 2rem))',
  },
  '.cm-content': { padding: '1rem 0 40vh', caretColor: 'var(--accent)' },
  '.cm-line': {
    position: 'relative',
    padding: '0 calc(var(--results-width) + 3rem) 0 1rem',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--muted)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.25rem 0 0.75rem', minWidth: '2.25rem' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--selection) !important' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)' },
});
