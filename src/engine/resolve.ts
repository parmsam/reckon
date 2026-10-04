import { CONSTANTS, FUNCTIONS, FUNCTION_ALIASES } from './functions';
import type { Token } from './lexer';
import { CalcError, type Decimal } from './values';

/**
 * The resolve pass turns raw tokens into meaningful ones. It joins multi-word variables and
 * operators and classifies words. Words it doesn't recognise are dropped, which is what lets
 * `3 apples + 2 apples` evaluate to 5.
 */

export type Op = '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' | '%' | '!' | 'mod';
export type Keyword = 'of' | 'off' | 'on' | 'conv' | 'is' | 'what';
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
  );

const OP_WORDS: Record<string, Op> = {
  plus: '+',
  minus: '-',
  times: '*',
  multiplied: '*',
  divided: '/',
  mod: 'mod',
  modulo: 'mod',
};
const CONVERSIONS = new Set(['in', 'to', 'as', 'into']);
const TARGETS: Record<string, Target> = {
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
const PERCENT_WORDS = new Set(['percent', 'pct']);
const SCALES: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};
const AGGREGATES: Record<string, Aggregate> = {
  sum: 'sum',
  total: 'sum',
  avg: 'avg',
  average: 'avg',
  mean: 'avg',
  count: 'count',
  min: 'min',
  max: 'max',
};
const PREV_WORDS = new Set(['prev', 'previous', 'ans']);
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
  return ['num', 'var', 'const', 'prev', 'line', 'agg'].includes(t.t);
}

function startsOperand(t: Token | undefined): boolean {
  return t?.type === 'number' || t?.type === 'word' || isOp(t, '(');
}

export function resolve(src: Token[], vars: ReadonlySet<string>): RToken[] {
  const out: RToken[] = [];
  const maxVarWords = Math.max(0, ...[...vars].map((v) => v.split(' ').length));
  const last = () => out[out.length - 1];
  const span = (a: Token, b: Token = a): Span => ({ from: a.from, to: b.to });

  let i = 0;
  while (i < src.length) {
    const tok = src[i]!;

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
  return out;
}
