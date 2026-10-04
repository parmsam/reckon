import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
} from '@codemirror/view';
import type { Settings } from '../engine';
import { copyCurrentResult, engineSettings, results } from './results';
import { reckonTheme } from './theme';

export { COPIED_EVENT } from './results';

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  settings?: Partial<Settings>;
  /** Called for edits made by the user, not for `setDoc` or `applyExternal`. */
  onChange?: (doc: string) => void;
}

export interface Editor {
  view: EditorView;
  /** Shows a different note, with fresh undo history. */
  setDoc(doc: string, options?: { readOnly?: boolean }): void;
  /** Replaces the text after a change from another tab, keeping the cursor nearby. */
  applyExternal(doc: string): void;
  getDoc(): string;
}

/** Marks transactions that didn't come from the user typing. */
const external = Annotation.define<boolean>();

export function createEditor({ parent, doc, settings = {}, onChange }: EditorOptions): Editor {
  const readOnly = new Compartment();
  const readOnlyExtensions = (on: boolean) => [
    EditorState.readOnly.of(on),
    EditorView.editable.of(!on),
  ];

  const createState = (text: string, ro: boolean) =>
    EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Note',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocorrect: 'off',
        }),
        placeholder('Type some math… try 20% of 50'),
        keymap.of([
          { key: 'Mod-Shift-c', run: copyCurrentResult, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        engineSettings.of(settings),
        results,
        reckonTheme,
        readOnly.of(readOnlyExtensions(ro)),
        EditorView.updateListener.of((update) => {
          const userEdit = update.transactions.some(
            (tr) => tr.docChanged && !tr.annotation(external),
          );
          if (userEdit) onChange?.(update.state.doc.toString());
        }),
      ],
    });

  const view = new EditorView({ parent, state: createState(doc, false) });

  return {
    view,
    setDoc(text, { readOnly: ro = false } = {}) {
      view.setState(createState(text, ro));
    },
    applyExternal(text) {
      const current = view.state.doc.toString();
      if (text === current) return;
      const head = Math.min(view.state.selection.main.head, text.length);
      view.dispatch({
        changes: { from: 0, to: current.length, insert: text },
        selection: EditorSelection.cursor(head),
        annotations: [external.of(true)],
      });
    },
    getDoc: () => view.state.doc.toString(),
  };
}
