import { Facet, StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { change, evaluateDocument, type LineResult, type Settings } from '../engine';

export type EditorSettings = Partial<Settings> & {
  /** When the exchange rates were fetched, shown on currency results. */
  ratesAsOf?: number;
  /** Show a slider handle on `name = number` lines. */
  sliders?: boolean;
  /** ⌥/Alt-drag numbers to change them. */
  scrub?: boolean;
};

/** Engine settings (locale, precision, rates…) for this editor. */
export const engineSettings = Facet.define<EditorSettings, EditorSettings>({
  combine: (values) => Object.assign({}, ...values),
});

/** Per-line results for the current document. Recomputed when the text or settings change. */
export const resultsField = StateField.define<LineResult[]>({
  create: (state) => evaluate(state),
  update: (results, tr) =>
    tr.docChanged || tr.startState.facet(engineSettings) !== tr.state.facet(engineSettings)
      ? evaluate(tr.state)
      : results,
});

/** Starts (with the answers before) or ends (null) an adjusting session: a slider or a scrub. */
export const setAdjusting = StateEffect.define<LineResult[] | null>();

/**
 * The answers from before the current slider or scrub started, so every line can show how far it
 * moved. Null when nothing is being adjusted. Any other edit ends it.
 */
export const adjustingField = StateField.define<LineResult[] | null>({
  create: () => null,
  update: (before, tr) => {
    for (const e of tr.effects) if (e.is(setAdjusting)) return e.value;
    if (!before || !tr.docChanged) return before;
    return tr.isUserEvent('input.adjust') ? before : null;
  },
});

/** "+$120.00" for line `i` while adjusting, if its answer moved. */
export function lineChange(state: EditorState, i: number): string | undefined {
  const before = state.field(adjustingField, false);
  const results = state.field(resultsField);
  if (!before || before.length !== results.length) return undefined;
  return change(before[i]?.value, results[i]?.value, state.facet(engineSettings));
}

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

/** One shared tooltip for "why this answer?" and "why no answer?". */
let tip: HTMLElement | undefined;
function showTip(anchor: HTMLElement, text: string): void {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'explain-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
  }
  tip.textContent = text;
  tip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 16);
  tip.style.maxWidth = `${width}px`;
  tip.style.top = `${rect.bottom + 6}px`;
  tip.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
}
function hideTip(): void {
  if (tip) tip.hidden = true;
}

/** Shows `text` on hover (and on tap, for touch screens). */
function explainOnHover(el: HTMLElement, text: string): void {
  el.addEventListener('mouseenter', () => showTip(el, text));
  el.addEventListener('mouseleave', hideTip);
}

class ResultWidget extends WidgetType {
  constructor(
    readonly display: string,
    readonly info: string,
    /** How far the answer moved during a slider or scrub ("+$120.00"). */
    readonly delta?: string,
  ) {
    super();
  }

  eq(other: ResultWidget): boolean {
    return other.display === this.display && other.info === this.info && other.delta === this.delta;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-result';
    if (this.delta) {
      const delta = document.createElement('span');
      delta.className = 'cm-result-delta';
      delta.textContent = this.delta;
      const answer = document.createElement('span');
      answer.className = 'cm-result-answer';
      answer.textContent = this.display;
      el.classList.add('cm-result-moved');
      el.append(delta, answer);
    } else el.textContent = this.display;
    explainOnHover(el, `${this.info}\nClick to copy`);
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

/** Plainer wording for the engine's reasons a line has no answer. */
function reason(error: string): string {
  if (/^Unexpected token|^Expected/.test(error))
    return "Reckon couldn't read this line as a calculation.";
  if (/^Unexpected end/.test(error)) return 'The line ends before the calculation does.';
  if (/^Unknown name "(.+)"/.test(error))
    return `${error.replace(/^Unknown name/, 'Nothing is called')} above this line.`;
  return error.endsWith('.') ? error : `${error}.`;
}

/** A muted "?" where an answer would be, explaining why there isn't one. */
class WhyWidget extends WidgetType {
  constructor(readonly error: string) {
    super();
  }

  eq(other: WhyWidget): boolean {
    return other.error === this.error;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-why';
    el.textContent = '?';
    el.setAttribute('aria-label', 'Why no answer?');
    const text = `No answer: ${reason(this.error)}`;
    explainOnHover(el, text);
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.addEventListener('click', () => (tip && !tip.hidden ? hideTip() : showTip(el, text)));
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const usesLine = Decoration.line({ class: 'cm-uses' });
const usedByLine = Decoration.line({ class: 'cm-used-by' });

/**
 * Decorations that follow the cursor: the lines the cursor's line uses and is used by, and a "?"
 * on lines without an answer (except the one being typed, so it doesn't flicker).
 */
const cursorField = StateField.define<{ line: number; decos: DecorationSet }>({
  create: (state) => buildCursorDecorations(state),
  update: (value, tr) => {
    const line = tr.state.doc.lineAt(tr.state.selection.main.head).number - 1;
    const answersChanged = tr.state.field(resultsField) !== tr.startState.field(resultsField);
    return answersChanged || line !== value.line ? buildCursorDecorations(tr.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decos),
});

function buildCursorDecorations(state: EditorState): { line: number; decos: DecorationSet } {
  const results = state.field(resultsField);
  const cursor = state.doc.lineAt(state.selection.main.head).number - 1;
  const ranges: Range<Decoration>[] = [];
  const uses = new Set(results[cursor]?.uses ?? []);
  results.forEach((r, i) => {
    const line = state.doc.line(i + 1);
    if (uses.has(i)) ranges.push(usesLine.range(line.from));
    else if (r.uses?.includes(cursor)) ranges.push(usedByLine.range(line.from));
    if (r.kind === 'error' && r.error && i !== cursor && line.text.trim()) {
      ranges.push(Decoration.widget({ widget: new WhyWidget(r.error), side: 1 }).range(line.to));
    }
  });
  return { line: cursor, decos: Decoration.set(ranges, true) };
}

const lineList = (lines: number[]) =>
  lines.length === 1 ? `line ${lines[0]! + 1}` : `lines ${lines.map((n) => n + 1).join(', ')}`;

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
  update: (decos, tr) =>
    tr.state.field(resultsField) !== tr.startState.field(resultsField) ||
    tr.state.field(adjustingField) !== tr.startState.field(adjustingField)
      ? buildDecorations(tr.state)
      : decos,
  provide: (field) => EditorView.decorations.from(field),
});

function buildDecorations(state: EditorState): DecorationSet {
  const results = state.field(resultsField);
  const { ratesAsOf, locale } = state.facet(engineSettings);
  const ratesNote = ratesAsOf
    ? `Exchange rates from ${new Date(ratesAsOf).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`
    : '';
  // Which lines use each line, for "Used by …".
  const usedBy = new Map<number, number[]>();
  results.forEach((r, i) => r.uses?.forEach((u) => usedBy.set(u, [...(usedBy.get(u) ?? []), i])));
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
      const info = [
        result.explain,
        result.uses?.length ? `Uses ${lineList(result.uses)}` : '',
        usedBy.get(i)?.length ? `Used by ${lineList(usedBy.get(i)!)}` : '',
        result.usesRates ? ratesNote : '',
      ]
        .filter(Boolean)
        .join('\n');
      const widget = Decoration.widget({
        widget: new ResultWidget(result.display, info, lineChange(state, i)),
        side: 1,
      });
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

export const results = [resultsField, adjustingField, decorationsField, cursorField, liveRegion];
