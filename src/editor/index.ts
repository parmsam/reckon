import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { toggleLineComment } from './commands';
import { completion } from './completion';
import type { LineResult } from '../engine';
import {
  copyCurrentResult,
  engineSettings,
  results,
  resultsField,
  type EditorSettings,
} from './results';
import { reckonTheme } from './theme';

export { COPIED_EVENT } from './results';

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  settings?: EditorSettings;
  /** Called for edits made by the user, not for `setDoc` or `applyExternal`. */
  onChange?: (doc: string) => void;
  /** Called when the text, selection or answers change (for the total bar). */
  onUpdate?: () => void;
}

export interface Editor {
  view: EditorView;
  /** Shows a different note, with fresh undo history. */
  setDoc(doc: string, options?: { readOnly?: boolean }): void;
  /** Replaces the text after a change from another tab, keeping the cursor nearby. */
  applyExternal(doc: string): void;
  getDoc(): string;
  /** The current answers, one per line. */
  getResults(): LineResult[];
  /** Replaces the selection with `text` (used by the phone keyboard row). */
  insert(text: string): void;
  /** Shows or hides line numbers. */
  setLineNumbers(on: boolean): void;
  /** Merges new engine settings (locale, rates…) and recomputes results. */
  setSettings(settings: EditorSettings): void;
}

/** Marks transactions that didn't come from the user typing. */
const external = Annotation.define<boolean>();

export function createEditor({
  parent,
  doc,
  settings = {},
  onChange,
  onUpdate,
}: EditorOptions): Editor {
  const readOnly = new Compartment();
  const settingsCompartment = new Compartment();
  const gutter = new Compartment();
  let showLineNumbers = false;
  let currentSettings = settings;
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
          { key: 'Mod-/', run: toggleLineComment, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        settingsCompartment.of(engineSettings.of(currentSettings)),
        results,
        completion,
        reckonTheme,
        readOnly.of(readOnlyExtensions(ro)),
        gutter.of(showLineNumbers ? lineNumbers() : []),
        EditorView.updateListener.of((update) => {
          const userEdit = update.transactions.some(
            (tr) => tr.docChanged && !tr.annotation(external),
          );
          if (userEdit) onChange?.(update.state.doc.toString());
          const answersChanged =
            update.startState.field(resultsField) !== update.state.field(resultsField);
          if (update.docChanged || update.selectionSet || answersChanged) onUpdate?.();
        }),
      ],
    });

  const view = new EditorView({ parent, state: createState(doc, false) });

  return {
    view,
    setDoc(text, { readOnly: ro = false } = {}) {
      view.setState(createState(text, ro));
      onUpdate?.();
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
    getResults: () => view.state.field(resultsField),
    insert(text) {
      view.dispatch(view.state.replaceSelection(text), {
        userEvent: 'input.type',
        scrollIntoView: true,
      });
    },
    setLineNumbers(on) {
      showLineNumbers = on;
      view.dispatch({ effects: gutter.reconfigure(on ? lineNumbers() : []) });
    },
    setSettings(next) {
      currentSettings = { ...currentSettings, ...next };
      view.dispatch({
        effects: settingsCompartment.reconfigure(engineSettings.of(currentSettings)),
      });
    },
  };
}
