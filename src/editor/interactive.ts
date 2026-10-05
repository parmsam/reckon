import { StateField, Transaction, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { D, type Decimal } from '../engine/values';
import { engineSettings, resultsField, setAdjusting } from './results';

/**
 * Changing numbers by direct manipulation (Bret Victor's "immediate connection"): a slider for
 * `name = number` lines, and ⌥/Alt-drag scrubbing. Both only touch plain numbers, and each
 * session is a single undo step.
 */

/** Plain numbers only: digits, optional thousands commas, optional decimals. Not 1.5k, 0xFF… */
const PLAIN = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/;

interface NumberAt {
  from: number;
  to: number;
  text: string;
}

const decimalsOf = (text: string) => (text.includes('.') ? text.split('.')[1]!.length : 0);

/** Writes `value` the way `original` was written: same decimals, commas if it had them. */
export function formatLike(original: string, value: Decimal): string {
  const decimals = decimalsOf(original);
  const fixed = value.toFixed(decimals);
  if (!original.includes(',')) return fixed;
  const [whole, fraction] = fixed.split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

const toDecimal = (text: string) => new D(text.replace(/,/g, ''));

/** The plain number token at `pos`, if there is one. */
function numberAtPos(state: EditorState, pos: number): NumberAt | undefined {
  const line = state.doc.lineAt(pos);
  const result = state.field(resultsField)[line.number - 1];
  const h = result?.highlights.find(
    (h) => h.type === 'number' && line.from + h.from <= pos && pos <= line.from + h.to,
  );
  if (!h) return undefined;
  const text = line.text.slice(h.from, h.to);
  return PLAIN.test(text) ? { from: line.from + h.from, to: line.from + h.to, text } : undefined;
}

/** For `name = <one plain number>` lines: the variable and its number. */
function sliderTarget(
  state: EditorState,
  lineNumber: number,
): (NumberAt & { name: string }) | undefined {
  const line = state.doc.line(lineNumber);
  const result = state.field(resultsField)[lineNumber - 1];
  if (!result?.variable || result.kind !== 'value') return undefined;
  const numbers = result.highlights.filter((h) => h.type === 'number');
  if (numbers.length !== 1) return undefined;
  const h = numbers[0]!;
  const text = line.text.slice(h.from, h.to);
  if (!PLAIN.test(text)) return undefined;
  return { from: line.from + h.from, to: line.from + h.to, text, name: result.variable };
}

/** A 1/2/5 × 10ⁿ step that gives about `count` steps across `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/**
 * Replaces the number between `from` and `to` while dragging, outside the undo history, then
 * records the whole session as one change when it ends. Until `finish`, answers show how far
 * they moved from where they were when the session began.
 */
function numberSession(view: EditorView, start: NumberAt) {
  let current = start.text;
  view.dispatch({ effects: setAdjusting.of(view.state.field(resultsField)) });
  const replace = (text: string, addToHistory: boolean) => {
    view.dispatch({
      changes: { from: start.from, to: start.from + current.length, insert: text },
      annotations: [
        Transaction.addToHistory.of(addToHistory),
        Transaction.userEvent.of('input.adjust'),
      ],
    });
    current = text;
  };
  return {
    set(value: Decimal) {
      const text = formatLike(start.text, value);
      if (text !== current) replace(text, false);
    },
    end() {
      if (current === start.text) return;
      const final = current;
      replace(start.text, false);
      replace(final, true);
    },
    /** Stops showing how far answers moved. */
    finish() {
      view.dispatch({ effects: setAdjusting.of(null) });
    },
  };
}

// ---- Slider -------------------------------------------------------------------------------

let popover: HTMLElement | undefined;

function openSlider(
  view: EditorView,
  anchor: HTMLElement,
  target: NumberAt & { name: string },
): void {
  popover?.remove();
  const value = toDecimal(target.text);
  const v = value.toNumber();
  const [min, max] = v === 0 ? [0, 100] : v > 0 ? [0, v * 2] : [v * 2, 0];
  const step = Math.max(10 ** -decimalsOf(target.text), niceStep(max - min, 200));
  const session = numberSession(view, target);

  const el = document.createElement('div');
  el.className = 'slider-popover';
  el.setAttribute('popover', 'auto');
  const label = document.createElement('label');
  label.textContent = target.name;
  const output = document.createElement('output');
  output.textContent = target.text;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(v);
  input.setAttribute('aria-label', `Adjust ${target.name}`);
  input.addEventListener('input', () => {
    const next = new D(input.value);
    session.set(next);
    output.textContent = formatLike(target.text, next);
  });
  input.addEventListener('change', () => session.end());
  label.append(input, output);
  el.append(label);
  el.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'closed') {
      session.end();
      session.finish();
      el.remove();
      if (popover === el) popover = undefined;
    }
  });
  document.body.append(el);
  popover = el;

  const rect = anchor.getBoundingClientRect();
  el.style.top = `${rect.bottom + 6}px`;
  el.style.left = `${Math.max(8, Math.min(rect.left - 20, window.innerWidth - 280))}px`;
  el.showPopover();
  input.focus();
}

class SliderHandle extends WidgetType {
  constructor(readonly target: NumberAt & { name: string }) {
    super();
  }

  eq(other: SliderHandle): boolean {
    return other.target.from === this.target.from && other.target.text === this.target.text;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cm-slider-handle';
    el.textContent = '⇆';
    el.title = `Adjust ${this.target.name} with a slider`;
    el.setAttribute('aria-label', `Adjust ${this.target.name} with a slider`);
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.addEventListener('click', () => openSlider(view, el, this.target));
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** The slider handle on the cursor's line, when it's `name = <plain number>`. */
const sliderField = StateField.define<DecorationSet>({
  create: (state) => sliderDecorations(state),
  update: (decos, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.startState.facet(engineSettings) !== tr.state.facet(engineSettings)
      ? sliderDecorations(tr.state)
      : decos,
  provide: (field) => EditorView.decorations.from(field),
});

function sliderDecorations(state: EditorState): DecorationSet {
  if (state.facet(engineSettings).sliders === false || state.readOnly) return Decoration.none;
  const line = state.doc.lineAt(state.selection.main.head).number;
  const target = sliderTarget(state, line);
  if (!target) return Decoration.none;
  const handle: Range<Decoration> = Decoration.widget({
    widget: new SliderHandle(target),
    side: 1,
  }).range(target.to);
  return Decoration.set([handle]);
}

// ---- Scrubbing ----------------------------------------------------------------------------

const PX_PER_STEP = 4;

/** ⌥/Alt-drag a plain number sideways to change it (Shift for 10× steps). Off unless enabled. */
const scrubbing = ViewPlugin.define((view) => {
  const enabled = () => view.state.facet(engineSettings).scrub === true && !view.state.readOnly;
  const altClass = (on: boolean) => view.dom.classList.toggle('cm-alt-held', on && enabled());
  const onKey = (e: KeyboardEvent) => altClass(e.altKey);
  const onBlur = () => altClass(false);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);

  const onPointerDown = (e: PointerEvent) => {
    if (!e.altKey || e.button !== 0 || e.pointerType === 'touch' || !enabled()) return;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const target = pos === null ? undefined : numberAtPos(view.state, pos);
    if (!target) return;
    e.preventDefault();
    const start = toDecimal(target.text);
    const base = 10 ** -decimalsOf(target.text);
    const session = numberSession(view, target);
    document.documentElement.classList.add('scrubbing');
    const move = (m: PointerEvent) => {
      const steps = Math.round((m.clientX - e.clientX) / PX_PER_STEP);
      session.set(start.plus(new D(base).times(steps).times(m.shiftKey ? 10 : 1)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.documentElement.classList.remove('scrubbing');
      session.end();
      session.finish();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  view.dom.addEventListener('pointerdown', onPointerDown, true);

  return {
    destroy() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      view.dom.removeEventListener('pointerdown', onPointerDown, true);
    },
  };
});

export const interactiveNumbers = [sliderField, scrubbing];
