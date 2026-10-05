import type { Aggregate, Target } from './resolve';
import type { DateSpec } from './dates';
import type { UnitDef, UnitExpr } from './units';
import type { Decimal } from './values';

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | 'mod';

export type Node =
  | { k: 'num'; value: Decimal }
  | { k: 'var'; name: string }
  | { k: 'const'; name: string }
  | { k: 'prev' }
  | { k: 'line'; n: number }
  | { k: 'agg'; name: Aggregate }
  | { k: 'neg'; arg: Node }
  | { k: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { k: 'percent'; arg: Node }
  | { k: 'fact'; arg: Node }
  | { k: 'call'; name: string; args: Node[] }
  /** `20% of 50` */
  | { k: 'pctOf'; pct: Node; base: Node }
  /** `10% off 50` */
  | { k: 'pctOff'; pct: Node; base: Node }
  /** `10% on 50` */
  | { k: 'pctOn'; pct: Node; base: Node }
  /** `5 as % of 20`, `5 is what % of 20` */
  | { k: 'pctWhatOf'; part: Node; whole: Node }
  /** `20% of what is 5` */
  | { k: 'pctOfWhat'; pct: Node; result: Node }
  | { k: 'convert'; arg: Node; target: Target }
  /** A bare unit, worth 1 of it: the `h` in km/h. */
  | { k: 'unit'; unit: UnitDef }
  /** `5 km`, `$30` */
  | { k: 'withUnit'; arg: Node; unit: UnitDef; power: number }
  /** `5 km in miles` */
  | { k: 'convertUnit'; arg: Node; unit: UnitExpr }
  | { k: 'date'; spec: DateSpec }
  /** `now in Tokyo` */
  | { k: 'convertZone'; arg: Node; zone: string }
  /** `days until Dec 25`, `time since 9am` */
  | { k: 'until'; arg: Node; unit?: UnitDef; since: boolean }
  /** `3 days ago` (sign -1), `in 3 days` / `3 days later` (sign 1) */
  | { k: 'fromNow'; arg: Node; sign: 1 | -1 }
  | { k: 'bool'; value: boolean }
  | { k: 'compare'; op: '<' | '>' | '<=' | '>=' | '==' | '!='; left: Node; right: Node }
  | { k: 'logic'; op: 'and' | 'or'; left: Node; right: Node }
  | { k: 'not'; arg: Node }
  | { k: 'bitwise'; op: '&' | '|' | 'xor' | '<<' | '>>'; left: Node; right: Node }
  | { k: 'if'; cond: Node; then: Node; else?: Node };

/** True if the expression reads a sum/avg/count/min/max aggregate. */
export function usesAggregate(node: Node): boolean {
  switch (node.k) {
    case 'agg':
      return true;
    case 'neg':
    case 'percent':
    case 'fact':
    case 'convert':
    case 'withUnit':
    case 'convertUnit':
    case 'convertZone':
    case 'until':
    case 'fromNow':
    case 'not':
      return usesAggregate(node.arg);
    case 'compare':
    case 'logic':
    case 'bitwise':
      return usesAggregate(node.left) || usesAggregate(node.right);
    case 'if':
      return (
        usesAggregate(node.cond) ||
        usesAggregate(node.then) ||
        (node.else ? usesAggregate(node.else) : false)
      );
    case 'binary':
      return usesAggregate(node.left) || usesAggregate(node.right);
    case 'call':
      return node.args.some(usesAggregate);
    case 'pctOf':
    case 'pctOff':
    case 'pctOn':
      return usesAggregate(node.pct) || usesAggregate(node.base);
    case 'pctWhatOf':
      return usesAggregate(node.part) || usesAggregate(node.whole);
    case 'pctOfWhat':
      return usesAggregate(node.pct) || usesAggregate(node.result);
    default:
      return false;
  }
}
