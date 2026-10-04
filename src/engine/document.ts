import { usesAggregate } from './ast';
import { defaultSettings, type Settings } from './context';
import { evaluate } from './evaluate';
import { formatValue } from './format';
import { parseLineCached, VariableNames, type Highlight } from './line';
import type { Value } from './values';

export type LineKind = 'blank' | 'comment' | 'heading' | 'text' | 'value' | 'error';

export interface LineResult {
  kind: LineKind;
  value?: Value;
  /** Formatted result, present only when `kind` is `value`. */
  display?: string;
  /** Why the line has no result, when `kind` is `error`. */
  error?: string;
  /** Variable assigned on this line, normalized ("monthly rent"). */
  variable?: string;
  /** Syntax highlighting ranges, relative to the start of the line. */
  highlights: Highlight[];
}

/**
 * Evaluates a whole note, top to bottom. Each line sees the variables and results of the lines
 * above it. `sum`, `avg`, `count`, `min` and `max` cover the current block: the lines since the
 * last heading or blank line, excluding lines that themselves use an aggregate.
 */
export function evaluateDocument(source: string, settings: Partial<Settings> = {}): LineResult[] {
  const s: Settings = { ...defaultSettings, ...settings };
  const vars = new Map<string, Value>();
  const names = new VariableNames();
  const results: LineResult[] = [];
  let block: Value[] = [];
  let prev: Value | undefined;

  const setVar = (name: string, value: Value | undefined) => {
    if (value) {
      vars.set(name, value);
      names.add(name);
    } else {
      vars.delete(name);
      names.delete(name);
    }
  };

  for (const raw of source.split('\n')) {
    const line = parseLineCached(raw, names.all, names.relevantKey(raw));
    const { highlights, variable } = line;

    switch (line.kind) {
      case 'blank':
      case 'heading':
        block = [];
        results.push({ kind: line.kind, highlights });
        continue;
      case 'comment':
        results.push({ kind: 'comment', highlights });
        continue;
      case 'text':
        if (variable) setVar(variable, undefined);
        results.push({ kind: 'text', highlights });
        continue;
      case 'error':
        if (variable) setVar(variable, undefined);
        results.push({ kind: 'error', error: line.error, variable, highlights });
        continue;
    }

    try {
      const value = evaluate(line.ast!, {
        vars,
        prev,
        lineValue: (n) => (n >= 1 && n <= results.length ? results[n - 1]!.value : undefined),
        block,
        settings: s,
      });
      prev = value;
      if (variable) setVar(variable, value);
      if (!usesAggregate(line.ast!)) block.push(value);
      results.push({ kind: 'value', value, display: formatValue(value, s), variable, highlights });
    } catch (e) {
      if (variable) setVar(variable, undefined);
      const error = e instanceof Error ? e.message : String(e);
      results.push({ kind: 'error', error, variable, highlights });
    }
  }
  return results;
}
