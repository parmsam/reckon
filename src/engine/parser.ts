import type { BinaryOp, Node } from './ast';
import type { Keyword, RToken } from './resolve';
import type { UnitTerm } from './units';
import { CalcError } from './values';

/** Binding power of prefix operators and of functions called without parentheses. */
const PREFIX_BP = 35;
const IMPLICIT_BP = 20;
/** Units bind tightest: 2 × 5 km is 2 × (5 km). */
const UNIT_BP = 60;

const isOp = (t: RToken | undefined, op: string) => t?.t === 'op' && t.op === op;
const isKw = (t: RToken | undefined, kw: Keyword) => t?.t === 'kw' && t.kw === kw;

/** Tokens that can start an operand after another one, as in `2pi` or `2(3 + 4)`. */
function startsImplicitOperand(t: RToken | undefined): boolean {
  if (!t) return false;
  // Two bare numbers in a row ("3 cats and 2 dogs") is ambiguous, so it's an error.
  if (t.t === 'num' || t.t === 'kw' || t.t === 'target' || t.t === 'unit') return false;
  if (t.t === 'op') return t.op === '(';
  return true;
}

function infixBp(t: RToken | undefined): number {
  if (!t) return 0;
  if (t.t === 'op') {
    switch (t.op) {
      case '+':
      case '-':
        return 10;
      case '*':
      case '/':
      case 'mod':
        return 20;
      case '^':
        return 40;
      case '%':
      case '!':
        return 50;
    }
  }
  if (t.t === 'unit') return UNIT_BP;
  if (t.t === 'kw') {
    switch (t.kw) {
      case 'of':
      case 'off':
      case 'on':
        return 25;
      case 'is':
        return 5;
      case 'conv':
        return 1;
    }
  }
  return startsImplicitOperand(t) ? IMPLICIT_BP : 0;
}

/** Pratt parser. Throws CalcError if the tokens don't form one complete expression. */
export function parse(tokens: RToken[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => {
    const t = tokens[pos++];
    if (!t) throw new CalcError('Unexpected end of expression');
    return t;
  };
  const expectKw = (kw: Keyword) => {
    if (!isKw(next(), kw)) throw new CalcError(`Expected "${kw}"`);
  };
  /** Allows an unclosed parenthesis at the end of the line, like `sqrt(16`. */
  const closeParen = () => {
    if (isOp(peek(), ')')) next();
    else if (peek()) throw new CalcError('Expected ")"');
  };

  function prefix(t: RToken): Node {
    switch (t.t) {
      case 'num':
        return { k: 'num', value: t.value };
      case 'var':
        return { k: 'var', name: t.name };
      case 'const':
        return { k: 'const', name: t.name };
      case 'prev':
        return { k: 'prev' };
      case 'line':
        return { k: 'line', n: t.n };
      case 'agg':
        return { k: 'agg', name: t.name };
      case 'unit': {
        // Currency before the amount: $30, € (2 + 3), EUR 20.
        const n = peek();
        const amountFollows =
          n && (n.t === 'num' || n.t === 'var' || n.t === 'const' || isOp(n, '('));
        if (t.unit.prefix && amountFollows)
          return { k: 'withUnit', arg: expr(UNIT_BP - 1), unit: t.unit, power: 1 };
        return { k: 'unit', unit: t.unit };
      }
      case 'fn': {
        if (!isOp(peek(), '(')) return { k: 'call', name: t.name, args: [expr(PREFIX_BP)] };
        next();
        const args: Node[] = [];
        if (!isOp(peek(), ')')) {
          args.push(expr(0));
          while (isOp(peek(), ',')) {
            next();
            args.push(expr(0));
          }
        }
        closeParen();
        return { k: 'call', name: t.name, args };
      }
      case 'op':
        if (t.op === '(') {
          const inner = expr(0);
          closeParen();
          return inner;
        }
        if (t.op === '-') return { k: 'neg', arg: expr(PREFIX_BP) };
        if (t.op === '+') return expr(PREFIX_BP);
    }
    throw new CalcError('Unexpected token');
  }

  /** A power written right after a unit (`m²`, `m^2`) belongs to the unit. */
  function unitPower(): number {
    const n = tokens[pos + 1];
    if (isOp(peek(), '^') && n?.t === 'num' && n.value.isInteger()) {
      pos += 2;
      return n.value.toNumber();
    }
    return 1;
  }

  /** Unit expression after a conversion keyword: `m/s`, `kg·m^2`, `km per h`. */
  function unitExpr(): UnitTerm[] {
    const terms: UnitTerm[] = [];
    let sign = 1;
    for (;;) {
      const t = next();
      if (t.t !== 'unit') throw new CalcError('Expected a unit');
      terms.push({ unit: t.unit, power: unitPower() * sign });
      if (isOp(peek(), '/')) {
        next();
        sign = -1;
      } else if (isOp(peek(), '*')) {
        next();
      } else if (peek()?.t !== 'unit') {
        return terms;
      }
    }
  }

  function infix(left: Node, t: RToken): Node {
    if (t.t === 'unit') return { k: 'withUnit', arg: left, unit: t.unit, power: unitPower() };
    if (t.t === 'op') {
      switch (t.op) {
        case '%':
          return { k: 'percent', arg: left };
        case '!':
          return { k: 'fact', arg: left };
        case '^':
          // Right associative: 2^3^2 = 2^9.
          return { k: 'binary', op: '^', left, right: expr(39) };
        default: {
          const right = expr(infixBp(t));
          // "1/3 m", "1/2 cup": a fraction of a unit, not 1 ÷ (3 m).
          if (t.op === '/' && left.k === 'num' && right.k === 'withUnit' && right.arg.k === 'num') {
            return { ...right, arg: { k: 'binary', op: '/', left, right: right.arg } };
          }
          return { k: 'binary', op: t.op as BinaryOp, left, right };
        }
      }
    }
    if (t.t === 'kw') {
      switch (t.kw) {
        case 'of':
          if (isKw(peek(), 'what')) {
            next();
            expectKw('is');
            return { k: 'pctOfWhat', pct: left, result: expr(25) };
          }
          return { k: 'pctOf', pct: left, base: expr(25) };
        case 'off':
          return { k: 'pctOff', pct: left, base: expr(25) };
        case 'on':
          return { k: 'pctOn', pct: left, base: expr(25) };
        case 'is': {
          expectKw('what');
          if (!isOp(next(), '%')) throw new CalcError('Expected "%"');
          expectKw('of');
          return { k: 'pctWhatOf', part: left, whole: expr(5) };
        }
        case 'conv': {
          if (peek()?.t === 'unit') return { k: 'convertUnit', arg: left, unit: unitExpr() };
          const target = next();
          if (target.t !== 'target') throw new CalcError('Expected a conversion target');
          if (target.target === 'percent' && isKw(peek(), 'of')) {
            next();
            return { k: 'pctWhatOf', part: left, whole: expr(1) };
          }
          return { k: 'convert', arg: left, target: target.target };
        }
      }
    }
    throw new CalcError('Unexpected token');
  }

  function expr(minBp: number): Node {
    let left = prefix(next());
    for (;;) {
      const t = peek();
      // Compound amounts: 6 ft 2 in, 1 h 30 min.
      if (
        left.k === 'withUnit' &&
        t?.t === 'num' &&
        tokens[pos + 1]?.t === 'unit' &&
        minBp < UNIT_BP - 1
      ) {
        left = { k: 'binary', op: '+', left, right: expr(UNIT_BP - 1) };
        continue;
      }
      const bp = infixBp(t);
      if (bp <= minBp || !t) break;
      if (startsImplicitOperand(t)) {
        left = { k: 'binary', op: '*', left, right: expr(IMPLICIT_BP) };
      } else {
        next();
        left = infix(left, t);
      }
    }
    return left;
  }

  const node = expr(0);
  if (pos < tokens.length) throw new CalcError('Unexpected token');
  return node;
}
