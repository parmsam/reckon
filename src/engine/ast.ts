import type { Aggregate, Target } from './resolve';
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
  | { k: 'convert'; arg: Node; target: Target };

/** True if the expression reads a sum/avg/count/min/max aggregate. */
export function usesAggregate(node: Node): boolean {
  switch (node.k) {
    case 'agg':
      return true;
    case 'neg':
    case 'percent':
    case 'fact':
    case 'convert':
      return usesAggregate(node.arg);
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
