import { CONSTANTS, FUNCTIONS, FUNCTION_ALIASES } from './functions';
import { dateAt, zoneAt, type DateSpec } from './dates';
import type { Token } from './lexer';
import { lookupUnit, MAX_UNIT_WORDS, type UnitDef } from './units';
import { dim, sameDim } from './units/dims';
import { CalcError, type Decimal } from './values';

/**
 * The resolve pass turns raw tokens into meaningful ones. It joins multi-word variables and
 * operators and classifies words. Words it doesn't recognise are dropped, which is what lets
 * `3 apples + 2 apples` evaluate to 5.
 */

export type Op = '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' | '%' | '!' | 'mod';
export type Keyword = 'of' | 'off' | 'on' | 'conv' | 'is' | 'what' | 'from' | 'ago' | 'later';
export type Target = 'hex' | 'bin' | 'oct' | 'sci' | 'dec' | 'percent';
export type Aggregate = 'sum' | 'avg' | 'count' | 'min' | 'max';

interface Span {
  from: number;
  to: number;
}

export type RToken = Span &
  (
    | { t: 'num'; value: Decimal }
    | { t: 'op'; op: Op }
    | { t: 'kw'; kw: Keyword }
    | { t: 'target'; target: Target }
    | { t: 'fn'; name: string }
    | { t: 'const'; name: string }
    | { t: 'var'; name: string }
    | { t: 'prev' }
    | { t: 'line'; n: number }
    | { t: 'agg'; name: Aggregate }
    | { t: 'unit'; unit: UnitDef }
    | { t: 'date'; spec: DateSpec }
    | { t: 'zone'; zone: string }
    /** "days until", "time since": `unit` is the unit to answer in, if given. */
    | { t: 'until'; unit?: UnitDef; since: boolean }
  );

export const OP_WORDS: Record<string, Op> = {
  plus: '+',
  minus: '-',
  times: '*',
  multiplied: '*',
  divided: '/',
  mod: 'mod',
  modulo: 'mod',
};
export const CONVERSIONS = new Set(['in', 'to', 'as', 'into']);
export const TARGETS: Record<string, Target> = {
  hex: 'hex',
  hexadecimal: 'hex',
  bin: 'bin',
  binary: 'bin',
  oct: 'oct',
  octal: 'oct',
  sci: 'sci',
  scientific: 'sci',
  dec: 'dec',
  decimal: 'dec',
  percent: 'percent',
  percentage: 'percent',
};
export const PERCENT_WORDS = new Set(['percent', 'pct']);
export const SCALES: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};
export const AGGREGATES: Record<string, Aggregate> = {
  sum: 'sum',
  total: 'sum',
  avg: 'avg',
  average: 'avg',
  mean: 'avg',
  count: 'count',
  min: 'min',
  max: 'max',
};
export const PREV_WORDS = new Set(['prev', 'previous', 'ans']);
const ARTICLES = new Set(['a', 'an']);
const BINARY_OPS = new Set(['+', '-', '*', '/', '^']);

/** Words that can't be used as variable names. */
export const RESERVED = new Set([
  ...Object.keys(OP_WORDS),
  ...CONVERSIONS,
  ...Object.keys(TARGETS),
  'of',
  'off',
  'on',
  'is',
  'what',
  'by',
]);

const lower = (t: Token | undefined) => (t?.type === 'word' ? t.text.toLowerCase() : undefined);
const isOp = (t: Token | undefined, op: string) => t?.type === 'op' && t.op === op;

function endsOperand(t: RToken | undefined): boolean {
  if (!t) return false;
  if (t.t === 'op') return t.op === ')' || t.op === '%' || t.op === '!';
  return ['num', 'var', 'const', 'prev', 'line', 'agg', 'unit', 'date'].includes(t.t);
}

/** Longest unit name starting at src[i]: "fl oz", "square feet", "km". */
function unitAt(src: Token[], i: number): { unit: UnitDef; length: number } | undefined {
  for (let length = Math.min(MAX_UNIT_WORDS, src.length - i); length >= 1; length--) {
    const words = src.slice(i, i + length);
    if (!words.every((t) => t.type === 'word')) continue;
    const unit = lookupUnit(words.map((t) => t.text).join(' '));
    if (unit) return { unit, length };
  }
  return undefined;
}

const INCHES = lookupUnit('inch')!;
const TIME = dim({ time: 1 });
const MINUTES = lookupUnit('minute')!;

function startsOperand(t: Token | undefined): boolean {
  return t?.type === 'number' || t?.type === 'word' || isOp(t, '(');
}

export function resolve(src: Token[], vars: ReadonlySet<string>): RToken[] {
  const out: RToken[] = [];
  const maxVarWords = Math.max(0, ...[...vars].map((v) => v.split(' ').length));
  const last = () => out[out.length - 1];
  const span = (a: Token, b: Token = a): Span => ({ from: a.from, to: b.to });
  const loneDateWords = new Set<RToken>();

  let i = 0;
  while (i < src.length) {
    const tok = src[i]!;

    // Dates and times: "Dec 25", "next friday at 3pm", "2026-07-04", "noon PST".
    const date =
      tok.type === 'word' && vars.has(tok.text.toLowerCase()) ? undefined : dateAt(src, i);
    if (date) {
      const token: RToken = { t: 'date', spec: date.spec, ...span(tok, src[i + date.length - 1]) };
      // A lone date word may just be prose; see the filter at the end.
      if (date.length === 1 && tok.type === 'word') loneDateWords.add(token);
      out.push(token);
      i += date.length;
      continue;
    }

    if (tok.type === 'number') {
      let value = tok.value!;
      const scale = SCALES[lower(src[i + 1]) ?? ''];
      if (scale) {
        value = value.times(scale);
        out.push({ t: 'num', value, ...span(tok, src[i + 1]) });
        i += 2;
      } else {
        out.push({ t: 'num', value, ...span(tok) });
        i += 1;
      }
      continue;
    }

    if (tok.type === 'op') {
      // `=` is noise: people often end a line with it ("2 + 2 =").
      if (tok.op !== '=') out.push({ t: 'op', op: tok.op as Op, ...span(tok) });
      i += 1;
      continue;
    }

    if (tok.type !== 'word') {
      i += 1;
      continue;
    }

    const w = tok.text.toLowerCase();

    // `x` between two operands means "times": 3 x 4.
    if (w === 'x' && endsOperand(last()) && startsOperand(src[i + 1])) {
      out.push({ t: 'op', op: '*', ...span(tok) });
      i += 1;
      continue;
    }

    // Longest multi-word variable match: "monthly rent".
    let matched = 0;
    for (let len = Math.min(maxVarWords, src.length - i); len >= 1 && !matched; len--) {
      const words = src.slice(i, i + len);
      if (words.every((t) => t.type === 'word')) {
        const name = words.map((t) => t.text.toLowerCase()).join(' ');
        if (vars.has(name)) {
          out.push({ t: 'var', name, ...span(tok, words[len - 1]) });
          matched = len;
        }
      }
    }
    if (matched) {
      i += matched;
      continue;
    }

    const opWord = OP_WORDS[w];
    if (opWord) {
      const by = lower(src[i + 1]) === 'by' && (w === 'multiplied' || w === 'divided');
      out.push({ t: 'op', op: opWord, ...span(tok, by ? src[i + 1] : tok) });
      i += by ? 2 : 1;
      continue;
    }

    const lineRef = /^line(\d+)$/.exec(w);
    if (lineRef) {
      out.push({ t: 'line', n: Number(lineRef[1]), ...span(tok) });
      i += 1;
      continue;
    }
    const lineNum = src[i + 1];
    if (w === 'line' && lineNum?.type === 'number' && lineNum.value!.isInteger()) {
      out.push({ t: 'line', n: lineNum.value!.toNumber(), ...span(tok, lineNum) });
      i += 2;
      continue;
    }

    if (PREV_WORDS.has(w)) {
      out.push({ t: 'prev', ...span(tok) });
      i += 1;
      continue;
    }

    // "time in Tokyo" is the current time there.
    const conversion = lower(src[i + 1]);
    if (w === 'time' && (conversion === 'in' || conversion === 'to') && zoneAt(src, i + 2)) {
      out.push({ t: 'date', spec: { base: { kind: 'now' }, timeOnly: true }, ...span(tok) });
      i += 1;
      continue;
    }

    // "days until Dec 25", "time since 9am", "until friday"
    const untilAt = (j: number) => ['until', 'till', 'since'].includes(lower(src[j]) ?? '');
    if (w === 'time' && untilAt(i + 1)) {
      out.push({ t: 'until', since: lower(src[i + 1]) === 'since', ...span(tok, src[i + 1]) });
      i += 2;
      continue;
    }
    const unitBefore = unitAt(src, i);
    if (unitBefore && sameDim(unitBefore.unit.dim, TIME) && untilAt(i + unitBefore.length)) {
      const word = src[i + unitBefore.length]!;
      out.push({
        t: 'until',
        unit: unitBefore.unit,
        since: lower(word) === 'since',
        ...span(tok, word),
      });
      i += unitBefore.length + 1;
      continue;
    }
    if (untilAt(i) && !endsOperand(last())) {
      out.push({ t: 'until', since: w === 'since', ...span(tok) });
      i += 1;
      continue;
    }

    // "2 weeks from today", "3 days ago"
    if (w === 'from' && endsOperand(last()) && dateAt(src, i + 1)) {
      out.push({ t: 'kw', kw: 'from', ...span(tok) });
      i += 1;
      continue;
    }
    if ((w === 'ago' || w === 'later') && endsOperand(last())) {
      out.push({ t: 'kw', kw: w, ...span(tok) });
      i += 1;
      continue;
    }

    // "km per hour": `per` divides between two operands.
    if (w === 'per') {
      if (endsOperand(last()) && src[i + 1]) out.push({ t: 'op', op: '/', ...span(tok) });
      i += 1;
      continue;
    }

    // `min` is minutes after an amount ("5 min", "in min", "km/min"), otherwise the minimum.
    const before = last();
    const unitPosition =
      endsOperand(before) ||
      (before?.t === 'kw' && before.kw === 'conv') ||
      (before?.t === 'op' && before.op === '/');
    if (w === 'min' && unitPosition && !isOp(src[i + 1], '(')) {
      out.push({ t: 'unit', unit: MINUTES, ...span(tok) });
      i += 1;
      continue;
    }

    const fnName = FUNCTION_ALIASES[w] ?? w;
    const aggregate = AGGREGATES[w];
    if (aggregate && !(isOp(src[i + 1], '(') && FUNCTIONS[fnName])) {
      out.push({ t: 'agg', name: aggregate, ...span(tok) });
      i += 1;
      continue;
    }
    if (FUNCTIONS[fnName]) {
      out.push({ t: 'fn', name: fnName, ...span(tok) });
      i += 1;
      continue;
    }

    if (CONSTANTS[w]) {
      out.push({ t: 'const', name: w, ...span(tok) });
      i += 1;
      continue;
    }

    if (PERCENT_WORDS.has(w)) {
      if (endsOperand(last())) out.push({ t: 'op', op: '%', ...span(tok) });
      i += 1;
      continue;
    }

    if (CONVERSIONS.has(w)) {
      // "in hex", "as %", "as a % of": only a conversion when a target follows.
      let j = i + 1;
      while (ARTICLES.has(lower(src[j]) ?? '')) j++;
      const next = src[j];
      const target: Target | undefined = isOp(next, '%') ? 'percent' : TARGETS[lower(next) ?? ''];
      if (target && next) {
        out.push({ t: 'kw', kw: 'conv', ...span(tok) });
        out.push({ t: 'target', target, ...span(next) });
        i = j + 1;
        continue;
      }
      // "now in Tokyo", "3pm PST to London"
      const zone = endsOperand(last()) && !unitAt(src, j) ? zoneAt(src, j) : undefined;
      if (zone) {
        out.push({ t: 'kw', kw: 'conv', ...span(tok) });
        out.push({ t: 'zone', zone: zone.zone, ...span(src[j]!, src[j + zone.length - 1]) });
        i = j + zone.length;
        continue;
      }
      // "in 3 days": a time from now.
      if (w === 'in' && !endsOperand(last()) && src[i + 1]?.type === 'number') {
        out.push({ t: 'kw', kw: 'later', ...span(tok) });
        i += 1;
        continue;
      }
      // "5 km in miles": the unit tokens that follow are the target. In "6 ft 2 in in cm" the
      // first `in` is inches.
      if (unitAt(src, j) && !(w === 'in' && lower(src[i + 1]) === 'in')) {
        out.push({ t: 'kw', kw: 'conv', ...span(tok) });
        i = j;
        continue;
      }
      // Otherwise `in` is inches, but only straight after an amount and not before more words,
      // so "6 ft 2 in" is a length and "5 people in the room" is just 5.
      const prevRaw = src[i - 1];
      const amountBefore = prevRaw?.type === 'number' || isOp(prevRaw, ')');
      const wordAfter = src[i + 1]?.type === 'word' && !CONVERSIONS.has(lower(src[i + 1])!);
      if (w === 'in' && amountBefore && endsOperand(last()) && !wordAfter) {
        out.push({ t: 'unit', unit: INCHES, ...span(tok) });
      }
      i += 1;
      continue;
    }

    const unit = unitAt(src, i);
    if (unit) {
      const after = src[i + unit.length];
      // A unit word right before a number is text ("s 5"), except currencies: $5, EUR 20.
      const descriptive = !unit.unit.prefix && !endsOperand(last()) && after?.type === 'number';
      if (!descriptive)
        out.push({ t: 'unit', unit: unit.unit, ...span(tok, src[i + unit.length - 1]) });
      i += unit.length;
      continue;
    }

    if (w === 'of' || w === 'off' || w === 'on') {
      // Only meaningful after a percentage-like operand; "the cost of 5" is just noise.
      const prev = last();
      const keep =
        (prev?.t === 'op' && (prev.op === '%' || prev.op === ')')) ||
        prev?.t === 'var' ||
        (prev?.t === 'target' && prev.target === 'percent');
      if (keep) out.push({ t: 'kw', kw: w, ...span(tok) });
      i += 1;
      continue;
    }

    if (w === 'what') {
      const prev = last();
      if (prev?.t === 'kw' && (prev.kw === 'of' || prev.kw === 'is')) {
        out.push({ t: 'kw', kw: 'what', ...span(tok) });
      }
      i += 1;
      continue;
    }

    if (w === 'is') {
      const prev = last();
      if (lower(src[i + 1]) === 'what' || (prev?.t === 'kw' && prev.kw === 'what')) {
        out.push({ t: 'kw', kw: 'is', ...span(tok) });
      }
      i += 1;
      continue;
    }

    // Unknown word: descriptive text, unless it sits where an operand belongs. `z + 1` with no
    // variable `z` must not silently evaluate to 1.
    const prev = last();
    const following = src[i + 1];
    const operandBefore = !prev || (prev.t === 'op' && !endsOperand(prev));
    const operandAfter = following?.type === 'op' && BINARY_OPS.has(following.op!);
    if (operandBefore && (operandAfter || (prev && !following))) {
      throw new CalcError(`Unknown name "${tok.text}"`);
    }
    i += 1;
  }
  // "I now have 5", "today I ran 5 km": a lone date word followed directly by a number (once the
  // descriptive words are gone) is prose, not a date.
  return out.filter((t, k) => !(loneDateWords.has(t) && out[k + 1]?.t === 'num'));
}
