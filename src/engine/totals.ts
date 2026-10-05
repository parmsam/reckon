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
  /** How many answers could be counted (numbers and amounts with units). */
  count: number;
}

export function totals(values: readonly Value[], settings: Partial<Settings> = {}): Totals {
  const s: Settings = { ...defaultSettings, ...settings };
  const ctx = { ppi: s.ppi, emPx: s.emPx, rates: s.rates };
  const countable = values.filter((v) => v.kind === 'number' || v.kind === 'quantity');
  const format = (name: string) => {
    try {
      return formatValue(aggregate(name, countable, ctx), s);
    } catch {
      return undefined;
    }
  };
  if (!countable.length) return { count: 0 };
  return { sum: format('sum'), avg: format('avg'), count: countable.length };
}
