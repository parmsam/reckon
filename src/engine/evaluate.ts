import type { BinaryOp, Node } from './ast';
import type { Settings } from './context';
import { CONSTANTS, callFunction, factorial } from './functions';
import { CalcError, D, finite, num, pct, type Decimal, type Value } from './values';

export interface Env {
  vars: ReadonlyMap<string, Value>;
  /** Most recent line result above this one. */
  prev?: Value;
  /** Result of a 1-based line number above this one. */
  lineValue(n: number): Value | undefined;
  /** Results in the current block (since the last heading or blank line). */
  block: readonly Value[];
  settings: Settings;
}

const ONE = new D(1);
const HUNDRED = new D(100);

function expectNumber(v: Value, what = 'a number'): Decimal {
  if (v.kind !== 'number') throw new CalcError(`Expected ${what}`);
  return v.value;
}

function expectPercent(v: Value): Decimal {
  if (v.kind !== 'percent') throw new CalcError('Expected a percentage');
  return v.value.div(HUNDRED);
}

/** Numbers pass through; percentages become fractions (50% → 0.5). */
function toDecimal(v: Value): Decimal {
  return v.kind === 'percent' ? v.value.div(HUNDRED) : v.value;
}

function arithmetic(op: BinaryOp, a: Decimal, b: Decimal): Decimal {
  switch (op) {
    case '+':
      return a.plus(b);
    case '-':
      return a.minus(b);
    case '*':
      return a.times(b);
    case '/':
      if (b.isZero()) throw new CalcError('Division by zero');
      return a.div(b);
    case 'mod':
      if (b.isZero()) throw new CalcError('Division by zero');
      return a.mod(b);
    case '^':
      return a.pow(b);
  }
}

function binary(op: BinaryOp, a: Value, b: Value): Value {
  if (a.kind === 'number' && b.kind === 'number') return num(arithmetic(op, a.value, b.value));

  // 50 + 10% = 55, 50 - 10% = 45, 50 * 10% = 5, 50 / 10% = 500
  if (a.kind === 'number' && b.kind === 'percent') {
    const f = b.value.div(HUNDRED);
    switch (op) {
      case '+':
        return num(a.value.times(ONE.plus(f)));
      case '-':
        return num(a.value.times(ONE.minus(f)));
      case '*':
        return num(a.value.times(f));
      case '/':
        return num(arithmetic('/', a.value, f));
    }
  }
  if (a.kind === 'percent' && b.kind === 'percent' && (op === '+' || op === '-')) {
    return pct(arithmetic(op, a.value, b.value));
  }
  if (a.kind === 'percent' && b.kind === 'number' && (op === '*' || op === '/')) {
    return pct(arithmetic(op, a.value, b.value));
  }
  throw new CalcError(`Can't apply ${op} to these values`);
}

function aggregate(name: string, block: readonly Value[]): Value {
  const values = block.filter((v) => v.kind === 'number').map((v) => v.value);
  if (name === 'count') return num(new D(values.length));
  if (name === 'sum') return num(values.length ? D.sum(...values) : new D(0));
  if (!values.length) throw new CalcError(`Nothing to ${name}`);
  if (name === 'avg') return num(D.sum(...values).div(values.length));
  return num(name === 'min' ? D.min(...values) : D.max(...values));
}

export function evaluate(node: Node, env: Env): Value {
  const result = evaluateNode(node, env);
  finite(result.value);
  return result;
}

function evaluateNode(node: Node, env: Env): Value {
  const ev = (n: Node) => evaluateNode(n, env);

  switch (node.k) {
    case 'num':
      return num(node.value);
    case 'var': {
      const v = env.vars.get(node.name);
      if (!v) throw new CalcError(`Unknown variable ${node.name}`);
      return v;
    }
    case 'const':
      return num(CONSTANTS[node.name]!);
    case 'prev':
      if (!env.prev) throw new CalcError('No previous result');
      return env.prev;
    case 'line': {
      const v = env.lineValue(node.n);
      if (!v) throw new CalcError(`Line ${node.n} has no result`);
      return v;
    }
    case 'agg':
      return aggregate(node.name, env.block);
    case 'neg': {
      const v = ev(node.arg);
      return v.kind === 'percent' ? pct(v.value.neg()) : num(v.value.neg());
    }
    case 'binary':
      return binary(node.op, ev(node.left), ev(node.right));
    case 'percent':
      return pct(expectNumber(ev(node.arg)));
    case 'fact':
      return num(factorial(expectNumber(ev(node.arg))));
    case 'call':
      return num(
        finite(
          callFunction(
            node.name,
            node.args.map((a) => toDecimal(ev(a))),
            env.settings,
          ),
        ),
      );
    case 'pctOf':
      return num(expectNumber(ev(node.base)).times(expectPercent(ev(node.pct))));
    case 'pctOff':
      return num(expectNumber(ev(node.base)).times(ONE.minus(expectPercent(ev(node.pct)))));
    case 'pctOn':
      return num(expectNumber(ev(node.base)).times(ONE.plus(expectPercent(ev(node.pct)))));
    case 'pctWhatOf': {
      const part = expectNumber(ev(node.part));
      const whole = expectNumber(ev(node.whole));
      return pct(arithmetic('/', part, whole).times(HUNDRED));
    }
    case 'pctOfWhat': {
      const p = expectPercent(ev(node.pct));
      return num(arithmetic('/', expectNumber(ev(node.result)), p));
    }
    case 'convert': {
      const v = ev(node.arg);
      if (node.target === 'percent') return v.kind === 'percent' ? v : pct(v.value.times(HUNDRED));
      const value = expectNumber(v);
      if (node.target === 'dec') return num(value);
      if (node.target !== 'sci' && !value.isInteger()) {
        throw new CalcError(`Only whole numbers can be shown in ${node.target}`);
      }
      return num(value, node.target);
    }
  }
}
