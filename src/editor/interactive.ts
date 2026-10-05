import { Facet, StateField, Transaction, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import type { Choice } from '../engine';
import { D, type Decimal } from '../engine/values';
import { engineSettings, resultsField, setAdjusting, setSweep, sweepField } from './results';

/**
 * Changing numbers by direct manipulation (Bret Victor's "immediate connection"): a slider for
 * `name = number` lines, and ⌥/Alt-drag scrubbing. Both only touch plain numbers, and each
 * session is a single undo step.
 */

/**
 * A read-only note whose numbers can still be adjusted, like a shared note: every slider line
 * shows its handle (a reader has no cursor to put on it), and nothing is saved.
 */
export const explorable = Facet.define<boolean, boolean>({ combine: (on) => on.some(Boolean) });

/** Whether numbers can be adjusted at all: in editable notes, and in explorable ones. */
const adjustable = (state: EditorState) => !state.readOnly || state.facet(explorable);

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

/** For `name = <one plain number>` lines that use no other lines: the variable and its number. */
function sliderTarget(
  state: EditorState,
  lineNumber: number,
): (NumberAt & { name: string }) | undefined {
  const line = state.doc.line(lineNumber);
  const result = state.field(resultsField)[lineNumber - 1];
  // Inputs only: `left = $3,000 - rent` uses other lines, so it isn't a slider for `left`.
  if (!result?.variable || result.kind !== 'value' || result.uses?.length) return undefined;
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
/** Whether the last slider was sweeping, so the next one starts the same way. */
let sweepOn = false;

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

  // Sweep: the slider's range, with a sparkline on every line that uses the variable.
  const line = view.state.doc.lineAt(target.from).number - 1;
  const sweepBox = document.createElement('input');
  sweepBox.type = 'checkbox';
  sweepBox.checked = sweepOn;
  const sweepLabel = document.createElement('label');
  sweepLabel.className = 'slider-sweep-toggle';
  sweepLabel.title = `Chart every answer that uses ${target.name} across this range`;
  sweepLabel.append(sweepBox, 'Sweep');
  const bound = (name: string, initial: number) => {
    const field = document.createElement('input');
    field.type = 'number';
    field.value = String(initial);
    field.setAttribute('aria-label', `${name} (the slider's range)`);
    field.addEventListener('change', applyRange);
    return field;
  };
  const fromField = bound('From', min);
  const toField = bound('To', max);
  const note = document.createElement('p');
  note.className = 'slider-sweep-note';
  note.setAttribute('aria-live', 'polite');
  function applyRange() {
    const from = Number(fromField.value);
    const to = Number(toField.value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return;
    input.min = String(from);
    input.max = String(to);
    input.step = String(Math.max(10 ** -decimalsOf(target.text), niceStep(to - from, 200)));
    sweepOn = sweepBox.checked;
    view.dispatch({ effects: setSweep.of(sweepOn ? { line, from, to } : null) });
    const sweeping = view.state.field(sweepField, false);
    note.textContent = sweepOn && !sweeping?.series.size ? `No lines use ${target.name} yet.` : '';
  }
  sweepBox.addEventListener('change', applyRange);
  const range = document.createElement('div');
  range.className = 'slider-sweep';
  range.append(sweepLabel, fromField, '–', toField);
  el.append(label, range, note);
  if (sweepOn) applyRange();

  el.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'closed') {
      view.dispatch({ effects: setSweep.of(null) });
      session.end();
      session.finish();
      el.remove();
      if (popover === el) popover = undefined;
    }
  });
  document.body.append(el);
  popover = el;

  // On phones it docks to the bottom of the screen (see styles.css), clear of the answers below.
  if (!matchMedia('(max-width: 600px)').matches) {
    const rect = anchor.getBoundingClientRect();
    el.style.top = `${rect.bottom + 6}px`;
    el.style.left = `${Math.max(8, Math.min(rect.left - 20, window.innerWidth - 280))}px`;
  }
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

/** The slider handle on the cursor's line (every line, when explorable) for `name = <plain number>`. */
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
  if (state.facet(engineSettings).sliders === false || !adjustable(state)) return Decoration.none;
  const cursor = state.doc.lineAt(state.selection.main.head).number;
  const lines = state.facet(explorable)
    ? Array.from({ length: state.doc.lines }, (_, i) => i + 1)
    : [cursor];
  const handles: Range<Decoration>[] = [];
  for (const line of lines) {
    const target = sliderTarget(state, line);
    if (target) {
      handles.push(
        Decoration.widget({ widget: new SliderHandle(target), side: 1 }).range(target.to),
      );
    }
  }
  return Decoration.set(handles);
}

// ---- Scrubbing ----------------------------------------------------------------------------

const PX_PER_STEP = 4;

/** ⌥/Alt-drag a plain number sideways to change it (Shift for 10× steps). Off unless enabled. */
const scrubbing = ViewPlugin.define((view) => {
  const enabled = () => view.state.facet(engineSettings).scrub === true && adjustable(view.state);
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

// ---- Choices ------------------------------------------------------------------------------

/** Moves the brackets on a choice line to the next option (or the previous one, `step` -1). */
function cycleChoice(view: EditorView, lineNumber: number, step: 1 | -1): boolean {
  const choice = view.state.field(resultsField)[lineNumber - 1]?.choice;
  if (!choice || !adjustable(view.state)) return false;
  const { from } = view.state.doc.line(lineNumber);
  const n = choice.options.length;
  const next = choice.options[(choice.current + step + n) % n]!;
  const changes: { from: number; to?: number; insert: string }[] = [
    { from: from + next.from, insert: '[' },
    { from: from + next.to, insert: ']' },
  ];
  if (choice.brackets) {
    const [open, close] = choice.brackets;
    changes.push({ from: from + open, to: from + open + 1, insert: '' });
    changes.push({ from: from + close, to: from + close + 1, insert: '' });
  }
  view.dispatch({ changes, userEvent: 'input.choice' });
  return true;
}

/** Picks the next option on the cursor's line. Bound to Mod-Shift-Space. */
export function nextChoice(view: EditorView): boolean {
  return cycleChoice(view, view.state.doc.lineAt(view.state.selection.main.head).number, 1);
}

const choiceLabel = (choice: Choice) =>
  `${choice.options[choice.current]!.label}: click for the next option (${choice.options
    .map((o) => o.label)
    .join(', ')}); Shift-click for the previous one`;

/** The current option of every choice line, as a clickable word. */
const choiceField = StateField.define<DecorationSet>({
  create: (state) => choiceDecorations(state),
  update: (decos, tr) =>
    tr.state.field(resultsField) !== tr.startState.field(resultsField) ||
    tr.state.readOnly !== tr.startState.readOnly
      ? choiceDecorations(tr.state)
      : decos,
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * In a read-only note (no caret, nothing to edit) the current option is a real button, so it
 * takes focus and works with Enter and Space.
 */
class ChoiceButton extends WidgetType {
  constructor(
    readonly text: string,
    readonly label: string,
  ) {
    super();
  }

  eq(other: ChoiceButton): boolean {
    return other.text === this.text && other.label === this.label;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cm-choice-current';
    el.textContent = this.text;
    el.title = this.label;
    el.setAttribute('aria-label', this.label);
    el.addEventListener('click', (e) => {
      const line = view.state.doc.lineAt(view.posAtDOM(el)).number;
      const refocus = document.activeElement === el;
      cycleChoice(view, line, e.shiftKey ? -1 : 1);
      // The button is redrawn with the new option: keep focus on it.
      if (refocus) {
        const again = [...view.contentDOM.querySelectorAll<HTMLElement>('.cm-choice-current')];
        again.find((b) => view.state.doc.lineAt(view.posAtDOM(b)).number === line)?.focus();
      }
    });
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function choiceDecorations(state: EditorState): DecorationSet {
  if (!adjustable(state)) return Decoration.none;
  const marks: Range<Decoration>[] = [];
  state.field(resultsField).forEach((result, i) => {
    const choice = result.choice;
    if (!choice) return;
    const option = choice.options[choice.current]!;
    const from = state.doc.line(i + 1).from + option.from;
    const to = from + option.label.length;
    const label = choiceLabel(choice);
    const deco = state.readOnly
      ? Decoration.replace({ widget: new ChoiceButton(option.label, label) })
      : Decoration.mark({ class: 'cm-choice-current', attributes: { title: label } });
    marks.push(deco.range(from, to));
  });
  return Decoration.set(marks, true);
}

const choiceTarget = (e: Event) =>
  (e.target as HTMLElement | null)?.closest?.('.cm-choice-current') as HTMLElement | null;

const choiceClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const target = choiceTarget(e);
    if (!target || target.tagName === 'BUTTON' || e.button !== 0 || e.altKey) return false;
    e.preventDefault();
    const line = view.state.doc.lineAt(view.posAtDOM(target)).number;
    return cycleChoice(view, line, e.shiftKey ? -1 : 1);
  },
});

export const interactiveNumbers = [sliderField, scrubbing, choiceField, choiceClicks];
