import type { Settings } from './context';
import { CalcError, D, type Decimal } from './values';

interface FunctionDef {
  min: number;
  max: number;
  fn: (args: Decimal[], settings: Settings) => Decimal;
}

const PI = D.acos(-1);
const MAX_FACTORIAL = 10_000;

export const CONSTANTS: Record<string, Decimal> = {
  pi: PI,
  π: PI,
  tau: PI.times(2),
  τ: PI.times(2),
  e: new D(1).exp(),
  phi: new D(5).sqrt().plus(1).div(2),
  φ: new D(5).sqrt().plus(1).div(2),
};

const toRad = (x: Decimal, s: Settings) => (s.angleUnit === 'deg' ? x.times(PI).div(180) : x);
const fromRad = (x: Decimal, s: Settings) => (s.angleUnit === 'deg' ? x.times(180).div(PI) : x);
/** Drops the tiny residue trig leaves behind, so `sin(180)` is exactly 0. */
const tidy = (x: Decimal) => x.toDecimalPlaces(30);

function int(x: Decimal, what: string): number {
  if (!x.isInteger()) throw new CalcError(`${what} must be a whole number`);
  return x.toNumber();
}

export function factorial(x: Decimal): Decimal {
  const n = int(x, 'Factorial');
  if (n < 0 || n > MAX_FACTORIAL) throw new CalcError('Factorial out of range');
  let result = new D(1);
  for (let i = 2; i <= n; i++) result = result.times(i);
  return result;
}

function nthRoot(x: Decimal, n: Decimal): Decimal {
  if (n.isZero()) throw new CalcError('Root of degree 0');
  // Odd roots of negative numbers are real: root(-8, 3) = -2.
  if (x.isNeg() && n.isInteger() && n.mod(2).abs().eq(1)) return nthRoot(x.neg(), n).neg();
  return x.pow(new D(1).div(n));
}

const unary = (fn: (x: Decimal, s: Settings) => Decimal): FunctionDef => ({
  min: 1,
  max: 1,
  fn: ([x], s) => fn(x!, s),
});
const variadic = (fn: (args: Decimal[]) => Decimal): FunctionDef => ({ min: 1, max: Infinity, fn });

export const FUNCTIONS: Record<string, FunctionDef> = {
  sqrt: unary((x) => x.sqrt()),
  cbrt: unary((x) => x.cbrt()),
  root: { min: 2, max: 2, fn: ([x, n]) => nthRoot(x!, n!) },
  abs: unary((x) => x.abs()),
  round: {
    min: 1,
    max: 2,
    fn: ([x, dp]) => x!.toDecimalPlaces(dp ? int(dp, 'Decimal places') : 0, D.ROUND_HALF_UP),
  },
  floor: unary((x) => x.floor()),
  ceil: unary((x) => x.ceil()),
  trunc: unary((x) => x.trunc()),
  sin: unary((x, s) => tidy(toRad(x, s).sin())),
  cos: unary((x, s) => tidy(toRad(x, s).cos())),
  tan: unary((x, s) => {
    const r = toRad(x, s);
    if (tidy(r.cos()).isZero()) throw new CalcError('tan is undefined here');
    return tidy(r.tan());
  }),
  asin: unary((x, s) => tidy(fromRad(x.asin(), s))),
  acos: unary((x, s) => tidy(fromRad(x.acos(), s))),
  atan: unary((x, s) => tidy(fromRad(x.atan(), s))),
  sinh: unary((x) => x.sinh()),
  cosh: unary((x) => x.cosh()),
  tanh: unary((x) => x.tanh()),
  ln: unary((x) => x.ln()),
  log: { min: 1, max: 2, fn: ([x, base]) => x!.log(base ?? 10) },
  log2: unary((x) => x.log(2)),
  exp: unary((x) => x.exp()),
  fact: unary(factorial),
  min: variadic((args) => D.min(...args)),
  max: variadic((args) => D.max(...args)),
  sum: variadic((args) => D.sum(...args)),
  avg: variadic((args) => D.sum(...args).div(args.length)),
  median: variadic(median),
  stdev: variadic(stdev),
};

/** The middle value, or the mean of the two middle values. */
export function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : sorted[mid - 1]!.plus(sorted[mid]!).div(2);
}

/** Sample standard deviation (n − 1), like spreadsheets' STDEV. */
export function stdev(values: Decimal[]): Decimal {
  if (values.length < 2) throw new CalcError('Standard deviation needs at least two values');
  const mean = D.sum(...values).div(values.length);
  const squares = values.map((v) => v.minus(mean).pow(2));
  return D.sum(...squares)
    .div(values.length - 1)
    .sqrt();
}

export const FUNCTION_ALIASES: Record<string, string> = {
  average: 'avg',
  mean: 'avg',
  stddev: 'stdev',
  std: 'stdev',
  total: 'sum',
  factorial: 'fact',
};

export function callFunction(name: string, args: Decimal[], settings: Settings): Decimal {
  const def = FUNCTIONS[name];
  if (!def) throw new CalcError(`Unknown function ${name}`);
  if (args.length < def.min || args.length > def.max) {
    throw new CalcError(`Wrong number of arguments for ${name}`);
  }
  return def.fn(args, settings);
}
