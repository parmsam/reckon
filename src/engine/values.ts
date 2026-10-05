import { Decimal } from 'decimal.js';
import type { DateShow } from './dates';
import type { UnitExpr } from './units/types';

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
  | { kind: 'percent'; value: Decimal }
  /** An amount in `unit`: 5 km is { value: 5, unit: [{ km, 1 }] }. Never has an empty unit. */
  | { kind: 'quantity'; value: Decimal; unit: UnitExpr }
  /** A moment in time. `zoned` is set when the user named a time zone, so it's displayed. */
  | { kind: 'datetime'; value: Temporal.ZonedDateTime; show: DateShow; zoned?: boolean }
  /** The result of a comparison or condition. */
  | { kind: 'bool'; value: boolean };

export function num(value: Decimal, format?: NumberFormat): Value {
  return format ? { kind: 'number', value, format } : { kind: 'number', value };
}

/** A quantity, or a plain number when `unit` is empty. */
export function qty(value: Decimal, unit: UnitExpr): Value {
  return unit.length ? { kind: 'quantity', value, unit } : num(value);
}

export function bool(value: boolean): Value {
  return { kind: 'bool', value };
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
