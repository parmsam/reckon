import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
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
  onChange?: (doc: string) => void;
}

export function createEditor({ parent, doc, settings = {}, onChange }: EditorOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
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
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange?.(update.state.doc.toString());
        }),
      ],
    }),
  });
}
