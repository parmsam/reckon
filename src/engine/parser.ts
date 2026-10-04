import type { BinaryOp, Node } from './ast';
import type { Keyword, RToken } from './resolve';
import { CalcError } from './values';

/** Binding power of prefix operators and of functions called without parentheses. */
const PREFIX_BP = 35;
const IMPLICIT_BP = 20;

const isOp = (t: RToken | undefined, op: string) => t?.t === 'op' && t.op === op;
const isKw = (t: RToken | undefined, kw: Keyword) => t?.t === 'kw' && t.kw === kw;

/** Tokens that can start an operand after another one, as in `2pi` or `2(3 + 4)`. */
function startsImplicitOperand(t: RToken | undefined): boolean {
  if (!t) return false;
  // Two bare numbers in a row ("3 cats and 2 dogs") is ambiguous, so it's an error.
  if (t.t === 'num' || t.t === 'kw' || t.t === 'target') return false;
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

  function infix(left: Node, t: RToken): Node {
    if (t.t === 'op') {
      switch (t.op) {
        case '%':
          return { k: 'percent', arg: left };
        case '!':
          return { k: 'fact', arg: left };
        case '^':
          // Right associative: 2^3^2 = 2^9.
          return { k: 'binary', op: '^', left, right: expr(39) };
        default:
          return { k: 'binary', op: t.op as BinaryOp, left, right: expr(infixBp(t)) };
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
