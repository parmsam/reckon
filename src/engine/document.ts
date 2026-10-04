import { usesAggregate } from './ast';
import { defaultSettings, type Settings } from './context';
import { evaluate } from './evaluate';
import { formatValue } from './format';
import { parseLineCached, type Highlight } from './line';
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
  const names = new Set<string>();
  let namesKey = '';
  const results: LineResult[] = [];
  let block: Value[] = [];
  let prev: Value | undefined;

  const setVar = (name: string, value: Value | undefined) => {
    if (value) vars.set(name, value);
    else vars.delete(name);
    const had = names.has(name);
    if (value && !had) names.add(name);
    if (!value && had) names.delete(name);
    if (had !== Boolean(value)) namesKey = [...names].sort().join('\u0001');
  };

  for (const raw of source.split('\n')) {
    const line = parseLineCached(raw, names, namesKey);
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
