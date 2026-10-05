import { defaultSettings, type Settings } from './context';
import { binary } from './evaluate';
import { formatValue } from './format';
import type { Value } from './values';

/**
 * How much an answer moved, signed: "+$120.00", "−3 days", "+5%". Undefined when it didn't move
 * or the two can't be compared (different kinds, km and $, true/false).
 */
export function change(
  before: Value | undefined,
  after: Value | undefined,
  settings: Partial<Settings> = {},
): string | undefined {
  if (!before || !after || before.kind !== after.kind) return undefined;
  if (after.kind === 'bool' || after.kind === 'choice') return undefined;
  const s: Settings = { ...defaultSettings, ...settings };
  try {
    const diff = binary('-', after, before, { ppi: s.ppi, emPx: s.emPx, rates: s.rates });
    if (diff.kind === 'bool' || diff.kind === 'choice' || diff.kind === 'datetime')
      return undefined;
    if (diff.value.isZero()) return undefined;
    const text = formatValue({ ...diff, value: diff.value.abs() } as Value, s);
    // Too small to show at this precision: no change worth pointing at.
    if (/^[^1-9]*$/.test(text)) return undefined;
    return `${diff.value.isNegative() ? '−' : '+'}${text}`;
  } catch {
    return undefined;
  }
}
