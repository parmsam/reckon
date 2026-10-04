import { usesAggregate } from './ast';
import { defaultSettings, type Settings } from './context';
import { evaluate } from './evaluate';
import { formatValue } from './format';
import { lex } from './lexer';
import { parse } from './parser';
import { RESERVED, resolve } from './resolve';
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
}

const HEADING = /^\s*#{1,6}(?:\s|$)/;
const COMMENT = /^\s*\/\//;
/** `rent: 1200`. The colon must not sit inside a time like 3:30. */
const LABEL = /^([^:]*\p{L}[^:]*?):(?!\d)/u;
/** `monthly rent = 1200`. Every word of a name starts with a letter, so `line 2` stays a reference. */
const ASSIGNMENT = /^\s*([\p{L}_][\p{L}\p{N}_]*(?:\s+[\p{L}_][\p{L}\p{N}_]*)*)\s*=(?!=)(.*)$/u;

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function stripInlineComment(line: string): string {
  const at = line.indexOf('//');
  return at === -1 ? line : line.slice(0, at);
}

/**
 * Evaluates a whole note, top to bottom. Each line sees the variables and results of the lines
 * above it. `sum`, `avg`, `count`, `min` and `max` cover the current block: the lines since the
 * last heading or blank line, excluding lines that themselves use an aggregate.
 */
export function evaluateDocument(source: string, settings: Partial<Settings> = {}): LineResult[] {
  const s: Settings = { ...defaultSettings, ...settings };
  const vars = new Map<string, Value>();
  const results: LineResult[] = [];
  let block: Value[] = [];
  let prev: Value | undefined;

  for (const raw of source.split('\n')) {
    if (raw.trim() === '') {
      block = [];
      results.push({ kind: 'blank' });
      continue;
    }
    if (COMMENT.test(raw)) {
      results.push({ kind: 'comment' });
      continue;
    }
    if (HEADING.test(raw)) {
      block = [];
      results.push({ kind: 'heading' });
      continue;
    }

    let text = stripInlineComment(raw);
    const label = LABEL.exec(text);
    if (label) text = text.slice(label[0].length);

    let variable: string | undefined;
    const assignment = ASSIGNMENT.exec(text);
    if (assignment && !RESERVED.has(normalizeName(assignment[1]!))) {
      variable = normalizeName(assignment[1]!);
      text = assignment[2]!;
    }

    try {
      const tokens = resolve(lex(text), new Set(vars.keys()));
      if (tokens.length === 0) {
        if (variable) vars.delete(variable);
        results.push({ kind: 'text' });
        continue;
      }
      const ast = parse(tokens);
      const value = evaluate(ast, {
        vars,
        prev,
        lineValue: (n) => (n >= 1 && n <= results.length ? results[n - 1]!.value : undefined),
        block,
        settings: s,
      });
      prev = value;
      if (variable) vars.set(variable, value);
      if (!usesAggregate(ast)) block.push(value);
      results.push({ kind: 'value', value, display: formatValue(value, s), variable });
    } catch (e) {
      if (variable) vars.delete(variable);
      results.push({ kind: 'error', error: e instanceof Error ? e.message : String(e), variable });
    }
  }
  return results;
}
