import { Decimal } from 'decimal.js';

/** Decimal constructor used for all user math. Never use JS floats for results. */
export const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});
export type { Decimal };

export type NumberFormat = 'hex' | 'bin' | 'oct' | 'sci';

export type Value =
  | { kind: 'number'; value: Decimal; format?: NumberFormat }
  /** `value` holds the percentage, so `20%` is stored as 20. */
  | { kind: 'percent'; value: Decimal };

export function num(value: Decimal, format?: NumberFormat): Value {
  return format ? { kind: 'number', value, format } : { kind: 'number', value };
}

export function pct(value: Decimal): Value {
  return { kind: 'percent', value };
}

/** Expected failures (bad syntax, domain errors). The UI shows no result for these. */
export class CalcError extends Error {}

/** Throws unless `d` is a finite number. */
export function finite(d: Decimal): Decimal {
  if (!d.isFinite()) throw new CalcError('Result is not a finite number');
  return d;
}
