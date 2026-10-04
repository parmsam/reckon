import type { Settings } from './context';
import { D, type Decimal, type Value } from './values';

const SCI_ABOVE = new D('1e21');
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(s: Settings): Intl.NumberFormat {
  const key = `${s.locale}|${s.precision}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(s.locale, { maximumFractionDigits: s.precision });
    formatters.set(key, nf);
  }
  return nf;
}

function scientific(d: Decimal, s: Settings): string {
  return d.toSignificantDigits(Math.max(1, s.precision)).toExponential().replace('e+', 'e');
}

/** Formats radix output with uppercase digits: 0xFF. */
function radix(text: string): string {
  return text.replace(
    /^(-?0[xbo])(.*)$/,
    (_, prefix: string, digits: string) => prefix + digits.toUpperCase(),
  );
}

export function formatNumber(d: Decimal, s: Settings): string {
  if (d.isZero()) return '0';
  const abs = d.abs();
  if (abs.gte(SCI_ABOVE) || abs.lt(new D(10).pow(-s.precision))) return scientific(d, s);
  // Passing a string keeps every digit; Intl rounds it to `precision` decimals.
  return numberFormat(s).format(d.toFixed() as Intl.StringNumericLiteral);
}

export function formatValue(v: Value, s: Settings): string {
  if (v.kind === 'percent') return `${formatNumber(v.value, s)}%`;
  const d = v.value;
  switch (v.format) {
    case 'hex':
      return radix(d.toHexadecimal());
    case 'bin':
      return radix(d.toBinary());
    case 'oct':
      return radix(d.toOctal());
    case 'sci':
      return d.isZero() ? '0' : scientific(d, s);
    default:
      return formatNumber(d, s);
  }
}
