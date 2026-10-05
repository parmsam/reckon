import type { BinaryOp, Node } from './ast';
import type { Settings } from './context';
import {
  addDuration,
  difference,
  inZone,
  isCalendarDuration,
  resolveDate,
  type DateValue,
} from './datetime';
import { CONSTANTS, callFunction, factorial } from './functions';
import { getUnit, type UnitContext, type UnitExpr } from './units';
import {
  compatible,
  convert,
  expand,
  isUnitless,
  multiplyUnits,
  powerUnits,
} from './units/quantity';
import { bool, CalcError, D, finite, num, pct, qty, type Decimal, type Value } from './values';

export interface Env {
  vars: ReadonlyMap<string, Value>;
  /** Most recent line result above this one. */
  prev?: Value;
  /** Result of a 1-based line number above this one. */
  lineValue(n: number): Value | undefined;
  /** Results in the current block (since the last heading or blank line). */
  block: readonly Value[];
  settings: Settings;
  units: UnitContext;
  /** Functions defined in the note. */
  functions?: ReadonlyMap<string, { params: string[]; body: Node }>;
  /** Call depth, to stop runaway recursion. */
  depth?: number;
}

const MAX_DEPTH = 200;

const ONE = new D(1);
const HUNDRED = new D(100);
const RADIANS: UnitExpr = [{ unit: getUnit('rad')!, power: 1 }];

/** A number or quantity. A plain number has an empty unit. */
interface Amount {
  value: Decimal;
  unit: UnitExpr;
}

function amount(v: Value): Amount {
  if (v.kind === 'percent') throw new CalcError('Expected a number, not a percentage');
  if (v.kind === 'datetime') throw new CalcError('Expected a number, not a date');
  if (v.kind === 'bool') throw new CalcError('Expected a number, not true or false');
  return { value: v.value, unit: v.kind === 'quantity' ? v.unit : [] };
}

function expectNumber(v: Value): Decimal {
  if (v.kind !== 'number') throw new CalcError('Expected a plain number');
  return v.value;
}

function expectPercent(v: Value): Decimal {
  if (v.kind !== 'percent') throw new CalcError('Expected a percentage');
  return v.value.div(HUNDRED);
}

/** Builds a value, collapsing units that cancel to a plain number (km/m → number). */
function make(a: Amount, ctx: UnitContext): Value {
  if (a.unit.length && isUnitless(a.unit)) return num(convert(a.value, a.unit, [], ctx));
  return qty(a.value, a.unit);
}

/** Expresses both amounts in the first one's unit. A plain number adopts the other's unit. */
function align(a: Amount, b: Amount, ctx: UnitContext): [Amount, Amount] {
  if (!a.unit.length) return [{ value: a.value, unit: b.unit }, b];
  if (!b.unit.length) return [a, { value: b.value, unit: a.unit }];
  return [a, { value: convert(b.value, b.unit, a.unit, ctx), unit: a.unit }];
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

/** Date arithmetic: date ± duration, duration + date, date − date. */
function dateBinary(op: BinaryOp, a: Value, b: Value, ctx: UnitContext): Value {
  if (a.kind === 'datetime' && b.kind === 'datetime' && op === '-') {
    const d = difference(a, b);
    return qty(d.value, d.unit);
  }
  if (a.kind === 'datetime' && b.kind !== 'datetime' && (op === '+' || op === '-')) {
    return addDuration(a, amount(b), op === '+' ? 1 : -1, ctx);
  }
  if (b.kind === 'datetime' && a.kind !== 'datetime' && op === '+') {
    return addDuration(b, amount(a), 1, ctx);
  }
  throw new CalcError(`Can't apply ${op} to dates`);
}

export function binary(op: BinaryOp, a: Value, b: Value, ctx: UnitContext): Value {
  if (a.kind === 'datetime' || b.kind === 'datetime') return dateBinary(op, a, b, ctx);
  // 50 + 10% = 55, $50 - 10% = $45, 50 * 10% = 5, 50 / 10% = 500
  if (a.kind !== 'percent' && b.kind === 'percent') {
    const f = b.value.div(HUNDRED);
    const base = amount(a);
    const scaled = (value: Decimal) => make({ value, unit: base.unit }, ctx);
    switch (op) {
      case '+':
        return scaled(base.value.times(ONE.plus(f)));
      case '-':
        return scaled(base.value.times(ONE.minus(f)));
      case '*':
        return scaled(base.value.times(f));
      case '/':
        return scaled(arithmetic('/', base.value, f));
    }
    throw new CalcError(`Can't apply ${op} to a percentage`);
  }
  if (a.kind === 'percent') {
    if (b.kind === 'percent' && (op === '+' || op === '-')) {
      return pct(arithmetic(op, a.value, b.value));
    }
    if (b.kind === 'number' && (op === '*' || op === '/')) {
      return pct(arithmetic(op, a.value, b.value));
    }
    throw new CalcError(`Can't apply ${op} to these values`);
  }

  const x = amount(a);
  const y = amount(b);
  switch (op) {
    case '+':
    case '-':
    case 'mod': {
      const [p, q] = align(x, y, ctx);
      return make({ value: arithmetic(op, p.value, q.value), unit: p.unit }, ctx);
    }
    case '*': {
      const { expr, scale } = multiplyUnits(x.unit, y.unit, ctx);
      return make({ value: x.value.times(y.value).times(scale), unit: expr }, ctx);
    }
    case '/': {
      const { expr, scale } = multiplyUnits(x.unit, powerUnits(y.unit, -1), ctx);
      return make({ value: arithmetic('/', x.value, y.value).times(scale), unit: expr }, ctx);
    }
    case '^': {
      if (y.unit.length) throw new CalcError('Powers must be plain numbers');
      if (!x.unit.length) return num(x.value.pow(y.value));
      if (!y.value.isInteger()) throw new CalcError('Units can only be raised to whole powers');
      return make(
        { value: x.value.pow(y.value), unit: powerUnits(x.unit, y.value.toNumber()) },
        ctx,
      );
    }
  }
}

/** Numbers and quantities in a block, expressed in the unit of the first quantity. */
function blockAmounts(
  block: readonly Value[],
  ctx: UnitContext,
): { values: Decimal[]; unit: UnitExpr } {
  const amounts = block.filter((v) => v.kind === 'number' || v.kind === 'quantity').map(amount);
  const unit = amounts.find((a) => a.unit.length)?.unit ?? [];
  const values = amounts.map((a) =>
    a.unit.length ? convert(a.value, a.unit, unit, ctx) : a.value,
  );
  return { values, unit };
}

export function aggregate(name: string, block: readonly Value[], ctx: UnitContext): Value {
  const { values, unit } = blockAmounts(block, ctx);
  if (name === 'count') return num(new D(values.length));
  if (!values.length) {
    if (name === 'sum') return num(new D(0));
    throw new CalcError(`Nothing to ${name}`);
  }
  const result =
    name === 'sum'
      ? D.sum(...values)
      : name === 'avg'
        ? D.sum(...values).div(values.length)
        : name === 'min'
          ? D.min(...values)
          : D.max(...values);
  return make({ value: result, unit }, ctx);
}

const KEEPS_UNIT = new Set(['abs', 'round', 'floor', 'ceil', 'trunc']);
const COMBINES = new Set(['min', 'max', 'sum', 'avg']);
const TRIG = new Set(['sin', 'cos', 'tan']);
const ROOT_DEGREE: Record<string, number> = { sqrt: 2, cbrt: 3 };

function call(name: string, args: Value[], env: Env): Value {
  const ctx = env.units;
  const amounts = args.map((a) =>
    a.kind === 'percent' ? { value: a.value.div(HUNDRED), unit: [] } : amount(a),
  );
  const plain = (d: Decimal[], settings = env.settings) => finite(callFunction(name, d, settings));

  const unitArg = amounts.find((a) => a.unit.length);
  if (!unitArg) return num(plain(amounts.map((a) => a.value)));

  // min(3 m, 250 cm), sum($5, 7): everything in the first unit.
  if (COMBINES.has(name)) {
    const values = amounts.map((a) =>
      a.unit.length ? convert(a.value, a.unit, unitArg.unit, ctx) : a.value,
    );
    return make({ value: plain(values), unit: unitArg.unit }, ctx);
  }

  const [first, ...rest] = amounts;
  if (first !== unitArg || rest.some((a) => a.unit.length)) {
    throw new CalcError(`${name} doesn't take units there`);
  }

  // round(3.14159 m, 2) keeps the unit.
  if (KEEPS_UNIT.has(name)) {
    return make(
      { value: plain([first.value, ...rest.map((a) => a.value)]), unit: first.unit },
      ctx,
    );
  }

  // sqrt(16 m²) = 4 m.
  const degree = ROOT_DEGREE[name] ?? (name === 'root' ? rest[0]?.value.toNumber() : undefined);
  if (degree) {
    const terms = expand(first.unit);
    if (!terms.every((t) => Number.isInteger(t.power / degree))) {
      throw new CalcError(
        `Can't take that root of ${name === 'sqrt' ? 'that unit' : 'those units'}`,
      );
    }
    const unit = terms.map((t) => ({ unit: t.unit, power: t.power / degree }));
    return make({ value: plain([first.value, ...rest.map((a) => a.value)]), unit }, ctx);
  }

  // sin(90°), cos(pi rad)
  if (TRIG.has(name) && compatible(first.unit, RADIANS)) {
    const radians = convert(first.value, first.unit, RADIANS, ctx);
    return num(plain([radians], { ...env.settings, angleUnit: 'rad' }));
  }

  throw new CalcError(`${name} doesn't work with units`);
}

export function evaluate(node: Node, env: Env): Value {
  const result = evaluateNode(node, env);
  if (result.kind !== 'datetime' && result.kind !== 'bool') finite(result.value);
  return result;
}

function expectBool(v: Value): boolean {
  if (v.kind !== 'bool') throw new CalcError('Expected true or false');
  return v.value;
}

/** Compares two values: numbers and quantities (converting units), percentages, dates, booleans. */
function compare(
  op: '<' | '>' | '<=' | '>=' | '==' | '!=',
  a: Value,
  b: Value,
  ctx: UnitContext,
): boolean {
  let order: number;
  if (a.kind === 'datetime' && b.kind === 'datetime') {
    order = Temporal.ZonedDateTime.compare(a.value, b.value);
  } else if (a.kind === 'bool' || b.kind === 'bool') {
    if (a.kind !== 'bool' || b.kind !== 'bool' || (op !== '==' && op !== '!=')) {
      throw new CalcError("Can't compare those");
    }
    order = a.value === b.value ? 0 : 1;
  } else if (a.kind === 'percent' && b.kind === 'percent') {
    order = a.value.cmp(b.value);
  } else {
    const [x, y] = align(amount(a), amount(b), ctx);
    order = x.value.cmp(y.value);
  }
  switch (op) {
    case '<':
      return order < 0;
    case '>':
      return order > 0;
    case '<=':
      return order <= 0;
    case '>=':
      return order >= 0;
    case '==':
      return order === 0;
    case '!=':
      return order !== 0;
  }
}

const MAX_SHIFT = 4096n;

function bigInteger(v: Value): bigint {
  const d = expectNumber(v);
  if (!d.isInteger()) throw new CalcError('Bitwise operators need whole numbers');
  return BigInt(d.toFixed());
}

function bitwise(op: '&' | '|' | 'xor' | '<<' | '>>', a: Value, b: Value): Value {
  const x = bigInteger(a);
  const y = bigInteger(b);
  if ((op === '<<' || op === '>>') && (y < 0n || y > MAX_SHIFT))
    throw new CalcError('Shift out of range');
  const result =
    op === '&' ? x & y : op === '|' ? x | y : op === 'xor' ? x ^ y : op === '<<' ? x << y : x >> y;
  return num(new D(result.toString()));
}

function expectDate(v: Value): DateValue {
  if (v.kind !== 'datetime') throw new CalcError('Expected a date or time');
  return v;
}

const TODAY = { base: { kind: 'today', days: 0 } } as const;
const NOW = { base: { kind: 'now' } } as const;
const NOW_TIME = { base: { kind: 'now' }, timeOnly: true } as const;

function evaluateNode(node: Node, env: Env): Value {
  const ev = (n: Node) => evaluateNode(n, env);
  const ctx = env.units;

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
      return aggregate(node.name, env.block, ctx);
    case 'neg': {
      const v = ev(node.arg);
      if (v.kind === 'datetime' || v.kind === 'bool') throw new CalcError("Can't negate that");
      if (v.kind === 'percent') return pct(v.value.neg());
      return v.kind === 'quantity' ? qty(v.value.neg(), v.unit) : num(v.value.neg());
    }
    case 'binary':
      return binary(node.op, ev(node.left), ev(node.right), ctx);
    case 'percent':
      return pct(expectNumber(ev(node.arg)));
    case 'fact':
      return num(factorial(expectNumber(ev(node.arg))));
    case 'call': {
      const args = node.args.map(ev);
      const own = env.functions?.get(node.name);
      if (!own) return call(node.name, args, env);
      if (args.length !== own.params.length) {
        throw new CalcError(
          `${node.name} takes ${own.params.length} argument${own.params.length === 1 ? '' : 's'}`,
        );
      }
      const depth = (env.depth ?? 0) + 1;
      if (depth > MAX_DEPTH) throw new CalcError(`${node.name} calls itself too deeply`);
      const vars = new Map(env.vars);
      own.params.forEach((p, i) => vars.set(p, args[i]!));
      return evaluateNode(own.body, { ...env, vars, depth });
    }
    case 'pctOf': {
      const base = amount(ev(node.base));
      return make({ value: base.value.times(expectPercent(ev(node.pct))), unit: base.unit }, ctx);
    }
    case 'pctOff': {
      const base = amount(ev(node.base));
      const p = expectPercent(ev(node.pct));
      return make({ value: base.value.times(ONE.minus(p)), unit: base.unit }, ctx);
    }
    case 'pctOn': {
      const base = amount(ev(node.base));
      const p = expectPercent(ev(node.pct));
      return make({ value: base.value.times(ONE.plus(p)), unit: base.unit }, ctx);
    }
    case 'pctWhatOf': {
      const [part, whole] = align(amount(ev(node.part)), amount(ev(node.whole)), ctx);
      return pct(arithmetic('/', part.value, whole.value).times(HUNDRED));
    }
    case 'pctOfWhat': {
      const p = expectPercent(ev(node.pct));
      const result = amount(ev(node.result));
      return make({ value: arithmetic('/', result.value, p), unit: result.unit }, ctx);
    }
    case 'convert': {
      const v = ev(node.arg);
      if (node.target === 'percent') {
        return v.kind === 'percent' ? v : pct(expectNumber(v).times(HUNDRED));
      }
      const value = expectNumber(v);
      if (node.target === 'dec') return num(value);
      if (node.target !== 'sci' && !value.isInteger()) {
        throw new CalcError(`Only whole numbers can be shown in ${node.target}`);
      }
      return num(value, node.target);
    }
    case 'unit':
      return qty(ONE, [{ unit: node.unit, power: 1 }]);
    case 'withUnit': {
      const a = amount(ev(node.arg));
      const { expr, scale } = multiplyUnits(a.unit, [{ unit: node.unit, power: node.power }], ctx);
      return make({ value: a.value.times(scale), unit: expr }, ctx);
    }
    case 'date':
      return resolveDate(node.spec, env.settings);
    case 'bool':
      return bool(node.value);
    case 'compare':
      return bool(compare(node.op, ev(node.left), ev(node.right), ctx));
    case 'logic': {
      // Short-circuits: the right side is only evaluated when it matters.
      const left = expectBool(ev(node.left));
      if (node.op === 'and' ? !left : left) return bool(left);
      return bool(expectBool(ev(node.right)));
    }
    case 'not':
      return bool(!expectBool(ev(node.arg)));
    case 'bitwise':
      return bitwise(node.op, ev(node.left), ev(node.right));
    case 'if': {
      if (expectBool(ev(node.cond))) return ev(node.then);
      if (!node.else) throw new CalcError('The condition is false and there is no else');
      return ev(node.else);
    }
    case 'convertZone':
      return inZone(expectDate(ev(node.arg)), node.zone);
    case 'until': {
      let target = expectDate(ev(node.arg));
      const base = resolveDate(target.show === 'date' ? TODAY : NOW, env.settings);
      let d = node.since ? difference(base, target) : difference(target, base);
      // "days until Jan 1" after Jan 1 has passed means next year's.
      const spec = node.arg.k === 'date' ? node.arg.spec : undefined;
      if (!node.since && d.value.isNeg() && spec?.base?.kind === 'calendar' && !spec.base.year) {
        target = { ...target, value: target.value.add({ years: 1 }) };
        d = difference(target, base);
      }
      const value = node.unit
        ? convert(d.value, d.unit, [{ unit: node.unit, power: 1 }], ctx)
        : d.value;
      return qty(value, node.unit ? [{ unit: node.unit, power: 1 }] : d.unit);
    }
    case 'fromNow': {
      const d = amount(ev(node.arg));
      // "3 days ago" is a date; "in 45 min" is a time of day.
      const base = resolveDate(isCalendarDuration(d) ? TODAY : NOW_TIME, env.settings);
      return addDuration(base, d, node.sign, ctx);
    }
    case 'convertUnit': {
      const a = amount(ev(node.arg));
      // A plain number takes the target unit ("5 in cm" is 5 cm), except for counting units:
      // "36 in dozen" is 3 dozen.
      const value =
        a.unit.length || isUnitless(node.unit) ? convert(a.value, a.unit, node.unit, ctx) : a.value;
      return qty(value, node.unit);
    }
  }
}
