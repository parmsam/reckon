import { CURRENCY_SYMBOL_CHARS } from './units';
import { D, type Decimal } from './values';

export type TokenType = 'number' | 'word' | 'op' | 'other';

export interface Token {
  type: TokenType;
  /** Source text exactly as typed. */
  text: string;
  from: number;
  to: number;
  /** Numeric value, for `number` tokens. */
  value?: Decimal;
  /** Normalized operator (`×` → `*`, `**` → `^`), for `op` tokens. */
  op?: string;
}

const OP_ALIASES: Record<string, string> = {
  '×': '*',
  '·': '*',
  '⋅': '*',
  '÷': '/',
  '−': '-',
  '–': '-',
  ';': ',',
};
const OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ',', '%', '!', '=']);

const FRACTIONS: Record<string, [number, number]> = {
  '½': [1, 2],
  '⅓': [1, 3],
  '⅔': [2, 3],
  '¼': [1, 4],
  '¾': [3, 4],
  '⅕': [1, 5],
  '⅖': [2, 5],
  '⅗': [3, 5],
  '⅘': [4, 5],
  '⅙': [1, 6],
  '⅚': [5, 6],
  '⅛': [1, 8],
  '⅜': [3, 8],
  '⅝': [5, 8],
  '⅞': [7, 8],
};
const SUFFIXES: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, bn: 1e9 };

const RADIX = /^0(?:x[0-9a-f]+|b[01]+|o[0-7]+)(?![\p{L}\p{N}_])/iu;
/** `1,000,000.5`. Only outside parentheses, where `,` separates arguments. */
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)/;
const PLAIN = /^(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i;
const SUFFIX = /^(?:k|K|M|bn)(?![\p{L}\p{N}_])/u;
/** Words, including "°C" and contractions like "it's". */
const WORD = /^[\p{L}_°][\p{L}\p{N}_]*(?:['’]\p{L}+)*/u;
/** Single characters that act as words: currency symbols and foot/inch marks. */
const SYMBOL_WORDS = new Set([...CURRENCY_SYMBOL_CHARS, '′', '″']);
const SUPERSCRIPT_POWERS: Record<string, string> = { '²': '2', '³': '3' };

function fraction(ch: string | undefined): Decimal | undefined {
  const f = ch === undefined ? undefined : FRACTIONS[ch];
  return f && new D(f[0]).div(f[1]);
}

function matchNumber(rest: string, inParens: boolean): { length: number; value: Decimal } | null {
  const radix = RADIX.exec(rest);
  if (radix) return { length: radix[0].length, value: new D(radix[0].toLowerCase()) };

  const standalone = fraction(rest[0]);
  if (standalone) return { length: 1, value: standalone };

  const m = (!inParens && GROUPED.exec(rest)) || PLAIN.exec(rest);
  if (!m) return null;
  let length = m[0].length;
  let value = new D(m[0].replace(/[,_]/g, ''));

  const suffix = SUFFIX.exec(rest.slice(length));
  // "1¾" or "1 ¾"
  const gap = /^ +/.exec(rest.slice(length))?.[0].length ?? 0;
  const frac = fraction(rest[length + gap]);
  if (suffix) {
    value = value.times(SUFFIXES[suffix[0]]!);
    length += suffix[0].length;
  } else if (frac && value.isInteger()) {
    value = value.plus(frac);
    length += gap + 1;
  }
  return { length, value };
}

/** Splits one line of input into tokens. `offset` is added to every source range. */
export function lex(input: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    const number = matchNumber(rest, depth > 0);
    if (number) {
      const text = rest.slice(0, number.length);
      tokens.push({
        type: 'number',
        text,
        from: offset + i,
        to: offset + i + text.length,
        value: number.value,
      });
      i += number.length;
      continue;
    }

    if (SYMBOL_WORDS.has(ch)) {
      tokens.push({ type: 'word', text: ch, from: offset + i, to: offset + i + 1 });
      i += 1;
      continue;
    }

    // m² is m^2.
    const power = SUPERSCRIPT_POWERS[ch];
    if (power) {
      const at = offset + i;
      tokens.push({ type: 'op', text: ch, from: at, to: at + 1, op: '^' });
      tokens.push({ type: 'number', text: ch, from: at, to: at + 1, value: new D(power) });
      i += 1;
      continue;
    }

    const word = WORD.exec(rest);
    if (word) {
      tokens.push({
        type: 'word',
        text: word[0],
        from: offset + i,
        to: offset + i + word[0].length,
      });
      i += word[0].length;
      continue;
    }

    const isPow = rest.startsWith('**');
    const op = isPow ? '^' : (OP_ALIASES[ch] ?? ch);
    if (OPS.has(op)) {
      if (op === '(') depth++;
      if (op === ')') depth = Math.max(0, depth - 1);
      const length = isPow ? 2 : 1;
      tokens.push({
        type: 'op',
        text: rest.slice(0, length),
        from: offset + i,
        to: offset + i + length,
        op,
      });
      i += length;
      continue;
    }

    // Surrogate pairs (emoji) stay together as one token.
    // 5' 10" — straight quotes right after a number are feet and inches.
    const prev = tokens[tokens.length - 1];
    if ((ch === "'" || ch === '"') && prev?.type === 'number' && prev.to === offset + i) {
      tokens.push({
        type: 'word',
        text: ch === "'" ? '′' : '″',
        from: offset + i,
        to: offset + i + 1,
      });
      i += 1;
      continue;
    }

    const other = String.fromCodePoint(input.codePointAt(i)!);
    tokens.push({ type: 'other', text: other, from: offset + i, to: offset + i + other.length });
    i += other.length;
  }
  return tokens;
}
