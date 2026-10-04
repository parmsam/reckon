import { Facet, StateField, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { evaluateDocument, type LineResult, type Settings } from '../engine';

/** Engine settings (locale, precision, …) for this editor. */
export const engineSettings = Facet.define<Partial<Settings>, Partial<Settings>>({
  combine: (values) => Object.assign({}, ...values),
});

/** Per-line results for the current document. */
export const resultsField = StateField.define<LineResult[]>({
  create: (state) => evaluate(state),
  update: (results, tr) => (tr.docChanged ? evaluate(tr.state) : results),
});

function evaluate(state: EditorState): LineResult[] {
  return evaluateDocument(state.doc.toString(), state.facet(engineSettings));
}

/** Fired on the editor DOM when a result is copied, so the app can show feedback. */
export const COPIED_EVENT = 'reckon:copied';

async function copyResult(view: EditorView, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    view.dom.dispatchEvent(new CustomEvent(COPIED_EVENT, { detail: text, bubbles: true }));
  } catch {
    // Clipboard can be unavailable (permissions, insecure context). Nothing else to do.
  }
}

class ResultWidget extends WidgetType {
  constructor(readonly display: string) {
    super();
  }

  eq(other: ResultWidget): boolean {
    return other.display === this.display;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-result';
    el.textContent = this.display;
    el.title = 'Click to copy';
    // Screen readers get the result through the live region instead.
    el.setAttribute('aria-hidden', 'true');
    // Keep the caret where it is when the result is clicked.
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      el.classList.add('cm-result-copied');
      setTimeout(() => el.classList.remove('cm-result-copied'), 600);
      void copyResult(view, this.display);
    });
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const marks = new Map<string, Decoration>();
const mark = (type: string) => {
  let deco = marks.get(type);
  if (!deco) {
    deco = Decoration.mark({ class: `cm-tok-${type}` });
    marks.set(type, deco);
  }
  return deco;
};
const headingLine = Decoration.line({ class: 'cm-heading-line cm-no-result' });
const noResultLine = Decoration.line({ class: 'cm-no-result' });

const decorationsField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update: (decos, tr) => (tr.docChanged ? buildDecorations(tr.state) : decos),
  provide: (field) => EditorView.decorations.from(field),
});

function buildDecorations(state: EditorState): DecorationSet {
  const results = state.field(resultsField);
  const ranges: Range<Decoration>[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const line = state.doc.line(i + 1);
    if (result.kind === 'heading') ranges.push(headingLine.range(line.from));
    else if (result.display === undefined) ranges.push(noResultLine.range(line.from));
    for (const h of result.highlights) {
      if (h.to > h.from) ranges.push(mark(h.type).range(line.from + h.from, line.from + h.to));
    }
    if (result.display !== undefined) {
      const widget = Decoration.widget({ widget: new ResultWidget(result.display), side: 1 });
      ranges.push(widget.range(line.to));
    }
  }
  return Decoration.set(ranges, true);
}

/** Result of the line holding the main cursor, if it has one. */
export function currentResult(state: EditorState): string | undefined {
  const line = state.doc.lineAt(state.selection.main.head);
  return state.field(resultsField)[line.number - 1]?.display;
}

/** Copies the current line's result. Bound to Mod-Shift-c. */
export function copyCurrentResult(view: EditorView): boolean {
  const display = currentResult(view.state);
  if (display === undefined) return false;
  void copyResult(view, display);
  return true;
}

/** Announces the current line's result to screen readers. */
const liveRegion = ViewPlugin.fromClass(
  class {
    el: HTMLElement;
    last: string | undefined;

    constructor(view: EditorView) {
      this.el = document.createElement('div');
      this.el.className = 'cm-live-region';
      this.el.setAttribute('aria-live', 'polite');
      view.dom.appendChild(this.el);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return;
      const display = currentResult(update.state);
      if (display === this.last) return;
      this.last = display;
      this.el.textContent = display === undefined ? '' : `Result: ${display}`;
    }

    destroy() {
      this.el.remove();
    }
  },
);

export const results = [resultsField, decorationsField, liveRegion];
