import { defaultSettings, type Settings } from './context';
import { evaluateDocument, type LineResult } from './document';
import { convert, sameExpr } from './units/quantity';
import type { Value } from './values';

/** One dependent line's answers across a sweep, as plottable numbers. */
export interface SweepSeries {
  /** 0-based line. */
  line: number;
  /** One per sample; undefined where the line had no answer or one of another kind. */
  points: (number | undefined)[];
  /** The formatted answers at the first and last samples. */
  first?: string;
  last?: string;
}

/** Where the swept number is: a line (0-based) and its character range in that line. */
export interface SweepTarget {
  line: number;
  from: number;
  to: number;
}

/** Lines that use `line`, directly or through other lines, in order. */
export function dependents(results: readonly LineResult[], line: number): number[] {
  const affected = new Set([line]);
  const out: number[] = [];
  for (let i = line + 1; i < results.length; i++) {
    if (results[i]!.uses?.some((u) => affected.has(u))) {
      affected.add(i);
      out.push(i);
    }
  }
  return out;
}

/** A value as a number on one axis with `ref`: same kind, and amounts in `ref`'s unit. */
function magnitude(v: Value | undefined, ref: Value | undefined, s: Settings): number | undefined {
  if (!v || !ref || v.kind !== ref.kind) return undefined;
  switch (v.kind) {
    case 'bool':
      return v.value ? 1 : 0;
    case 'datetime':
      return v.value.epochMilliseconds;
    case 'quantity': {
      if (ref.kind !== 'quantity' || sameExpr(v.unit, ref.unit)) return v.value.toNumber();
      try {
        return convert(v.value, v.unit, ref.unit, s).toNumber();
      } catch {
        return undefined;
      }
    }
    default:
      return v.value.toNumber();
  }
}

/**
 * Re-evaluates the note once per sample, with the number at `target` replaced by each of
 * `samples` (written as they'd be typed), and returns the answers of every line that depends on
 * it. Lines below the last dependent can't change anything, so they're never evaluated.
 */
export function sweep(
  source: string,
  target: SweepTarget,
  samples: readonly string[],
  settings: Partial<Settings> = {},
): SweepSeries[] {
  const s: Settings = { ...defaultSettings, ...settings };
  const lines = source.split('\n');
  const deps = dependents(evaluateDocument(source, s), target.line);
  if (!deps.length) return [];
  const head = lines.slice(0, deps.at(-1)! + 1);
  const original = head[target.line]!;
  const runs = samples.map((sample) => {
    head[target.line] = original.slice(0, target.from) + sample + original.slice(target.to);
    return evaluateDocument(head.join('\n'), s);
  });
  return deps.map((line) => {
    const values = runs.map((r) => r[line]?.value);
    const ref = values.find(Boolean);
    return {
      line,
      points: values.map((v) => magnitude(v, ref, s)),
      first: runs[0]?.[line]?.display,
      last: runs.at(-1)?.[line]?.display,
    };
  });
}
