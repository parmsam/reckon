import type { Node } from './ast';
import type { Settings } from './context';
import { formatValue } from './format';
import { formatUnit } from './units/quantity';
import type { UnitContext } from './units';
import { convert } from './units/quantity';
import { D, type Value } from './values';

/**
 * Explains how a line was read, Bret Victor style: the expression written out with the values
 * of the names it uses ("rent ($1,200.00) + utilities ($150.00)"), plus a conversion factor
 * when it converts units ("1 km = 0.6214 mi").
 */

export interface ExplainContext {
  settings: Settings;
  units: UnitContext;
  /** Value of a leaf node (variable, previous answer, line reference, total, date), if any. */
  valueOf: (node: Node) => Value | undefined;
}

const OP_SYMBOLS: Record<string, string> = {
  '*': '×',
  '/': '÷',
  '-': '−',
  '^': '^',
  '+': '+',
  mod: 'mod',
};
const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2, '^': 3 };

function print(node: Node, ctx: ExplainContext): string {
  const p = (n: Node) => print(n, ctx);
  const withValue = (label: string) => {
    const v = ctx.valueOf(node);
    return v ? `${label} (${formatValue(v, ctx.settings)})` : label;
  };
  switch (node.k) {
    case 'num':
      return formatValue({ kind: 'number', value: node.value }, ctx.settings);
    case 'var':
      return withValue(node.name);
    case 'const':
      return node.name;
    case 'prev':
      return withValue('previous answer');
    case 'line':
      return withValue(`line ${node.n}`);
    case 'agg':
      return withValue(
        node.name === 'avg'
          ? 'average of the lines above'
          : node.name === 'stdev'
            ? 'standard deviation of the lines above'
            : `${node.name} of the lines above`,
      );
    case 'date':
    case 'unit':
      return formatValue(ctx.valueOf(node) ?? { kind: 'number', value: new D(1) }, ctx.settings);
    case 'neg':
      return `−${p(node.arg)}`;
    case 'binary': {
      const side = (child: Node) =>
        child.k === 'binary' && PRECEDENCE[child.op]! < PRECEDENCE[node.op]!
          ? `(${p(child)})`
          : p(child);
      return `${side(node.left)} ${OP_SYMBOLS[node.op]} ${side(node.right)}`;
    }
    case 'percent':
      return `${p(node.arg)}%`;
    case 'fact':
      return `${p(node.arg)}!`;
    case 'call':
      return `${node.name}(${node.args.map(p).join(', ')})`;
    case 'pctOf':
      return `${p(node.pct)} of ${p(node.base)}`;
    case 'pctOff':
      return `${p(node.pct)} off ${p(node.base)}`;
    case 'pctOn':
      return `${p(node.pct)} on ${p(node.base)}`;
    case 'pctWhatOf':
      return `${p(node.part)} as a percentage of ${p(node.whole)}`;
    case 'pctOfWhat':
      return `the amount ${p(node.pct)} of which is ${p(node.result)}`;
    case 'convert':
      return `${p(node.arg)} → ${node.target}`;
    case 'withUnit': {
      const symbol = formatUnit([{ unit: node.unit, power: node.power }]);
      return node.unit.prefix && node.arg.k === 'num'
        ? `${symbol}${p(node.arg)}`
        : `${p(node.arg)} ${symbol}`;
    }
    case 'convertUnit':
      return `${p(node.arg)} → ${formatUnit(node.unit)}`;
    case 'convertZone':
      return `${p(node.arg)} → ${node.zone.replace(/_/g, ' ')}`;
    case 'until':
      return `${node.unit ? formatUnit([{ unit: node.unit, power: 1 }], true) : 'time'} ${node.since ? 'since' : 'until'} ${p(node.arg)}`;
    case 'fromNow':
      return `${p(node.arg)} ${node.sign < 0 ? 'ago' : 'from now'}`;
    case 'bool':
      return String(node.value);
    case 'symbol':
      return node.label;
    case 'compare':
      return `${p(node.left)} ${node.op === '==' ? '=' : node.op === '!=' ? '≠' : node.op} ${p(node.right)}`;
    case 'logic':
      return `${p(node.left)} ${node.op} ${p(node.right)}`;
    case 'not':
      return `not ${p(node.arg)}`;
    case 'bitwise':
      return `${p(node.left)} ${node.op} ${p(node.right)}`;
    case 'if':
      return `if ${p(node.cond)} then ${p(node.then)}${node.else ? ` else ${p(node.else)}` : ''}`;
  }
}

/** "1 km = 0.6214 mi", for a conversion between two simple units. */
function conversionFactor(node: Node, ctx: ExplainContext): string | undefined {
  if (node.k !== 'convertUnit') return undefined;
  const from = ctx.valueOf(node.arg);
  if (from?.kind !== 'quantity' || from.unit.length !== 1 || node.unit.length !== 1)
    return undefined;
  if (from.unit[0]!.unit.offset || node.unit[0]!.unit.offset) return undefined;
  try {
    const one = convert(new D(1), from.unit, node.unit, ctx.units);
    const rhs = formatValue({ kind: 'quantity', value: one, unit: node.unit }, ctx.settings);
    return `1 ${formatUnit(from.unit)} = ${rhs}`;
  } catch {
    return undefined;
  }
}

export function explain(node: Node, ctx: ExplainContext): string {
  const reading = print(node, ctx);
  const factor = conversionFactor(node, ctx);
  return factor ? `${reading}\n${factor}` : reading;
}
