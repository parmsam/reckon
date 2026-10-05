import { defaultSettings, type Settings } from './context';
import { aggregate } from './evaluate';
import { formatValue } from './format';
import type { Value } from './values';

/**
 * Totals of a set of answers, the way `sum` and `avg` compute them: units convert to the first
 * one, plain numbers take it, and anything that can't be added (km and $) gives no total.
 */
export interface Totals {
  sum?: string;
  avg?: string;
  /** The sum as a value, for comparing totals. */
  sumValue?: Value;
  /** How many answers could be counted (numbers and amounts with units). */
  count: number;
}

export function totals(values: readonly Value[], settings: Partial<Settings> = {}): Totals {
  const s: Settings = { ...defaultSettings, ...settings };
  const ctx = { ppi: s.ppi, emPx: s.emPx, rates: s.rates };
  const countable = values.filter((v) => v.kind === 'number' || v.kind === 'quantity');
  const value = (name: string) => {
    try {
      return aggregate(name, countable, ctx);
    } catch {
      return undefined;
    }
  };
  if (!countable.length) return { count: 0 };
  const sumValue = value('sum');
  const avg = value('avg');
  return {
    sum: sumValue && formatValue(sumValue, s),
    avg: avg && formatValue(avg, s),
    sumValue,
    count: countable.length,
  };
}
