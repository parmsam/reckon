import type { Node } from './ast';
import { lex } from './lexer';
import { parse } from './parser';
import { RESERVED, resolve, type RToken } from './resolve';

export type HighlightType =
  | 'number'
  | 'operator'
  | 'keyword'
  | 'function'
  | 'constant'
  | 'variable'
  | 'reference'
  | 'label'
  | 'comment'
  | 'heading';

/** A highlighted range, in UTF-16 offsets from the start of the line. */
export interface Highlight {
  from: number;
  to: number;
  type: HighlightType;
}

/** Everything about a line that doesn't depend on values computed above it. */
export interface ParsedLine {
  kind: 'blank' | 'comment' | 'heading' | 'text' | 'expr' | 'error';
  variable?: string;
  ast?: Node;
  error?: string;
  highlights: Highlight[];
}

const HEADING = /^\s*#{1,6}(?:\s|$)/;
const COMMENT = /^\s*\/\//;
/** `rent: 1200`. The colon must not sit inside a time like 3:30. */
const LABEL = /^([^:]*\p{L}[^:]*?):(?!\d)/u;
/** `monthly rent = 1200`. Every word of a name starts with a letter, so `line 2` stays a reference. */
const ASSIGNMENT = /^(\s*)([\p{L}_][\p{L}\p{N}_]*(?:\s+[\p{L}_][\p{L}\p{N}_]*)*)\s*=(?!=)(.*)$/u;

export const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function tokenHighlight(t: RToken): HighlightType {
  switch (t.t) {
    case 'num':
      return 'number';
    case 'op':
      return 'operator';
    case 'kw':
    case 'target':
      return 'keyword';
    case 'fn':
      return 'function';
    case 'const':
      return 'constant';
    case 'var':
      return 'variable';
    default:
      return 'reference';
  }
}

/** Parses one line. `vars` is the set of variable names defined above it. */
export function parseLine(raw: string, vars: ReadonlySet<string>): ParsedLine {
  if (raw.trim() === '') return { kind: 'blank', highlights: [] };
  if (COMMENT.test(raw)) {
    return { kind: 'comment', highlights: [{ from: 0, to: raw.length, type: 'comment' }] };
  }
  if (HEADING.test(raw)) {
    return { kind: 'heading', highlights: [{ from: 0, to: raw.length, type: 'heading' }] };
  }

  const highlights: Highlight[] = [];
  const commentAt = raw.indexOf('//');
  let text = commentAt === -1 ? raw : raw.slice(0, commentAt);
  let offset = 0;

  const label = LABEL.exec(text);
  if (label) {
    highlights.push({ from: 0, to: label[0].length, type: 'label' });
    offset = label[0].length;
    text = text.slice(offset);
  }

  let variable: string | undefined;
  const assignment = ASSIGNMENT.exec(text);
  if (assignment && !RESERVED.has(normalizeName(assignment[2]!))) {
    variable = normalizeName(assignment[2]!);
    const nameFrom = offset + assignment[1]!.length;
    highlights.push({ from: nameFrom, to: nameFrom + assignment[2]!.length, type: 'variable' });
    const expression = assignment[3]!;
    offset += text.length - expression.length;
    text = expression;
  }

  const finish = (line: Omit<ParsedLine, 'highlights'>): ParsedLine => {
    if (commentAt !== -1) highlights.push({ from: commentAt, to: raw.length, type: 'comment' });
    return { ...line, highlights };
  };

  let tokens: RToken[];
  try {
    tokens = resolve(lex(text, offset), vars);
  } catch (e) {
    return finish({ kind: 'error', variable, error: (e as Error).message });
  }
  for (const t of tokens) highlights.push({ from: t.from, to: t.to, type: tokenHighlight(t) });
  if (tokens.length === 0) return finish({ kind: 'text', variable });

  try {
    return finish({ kind: 'expr', variable, ast: parse(tokens) });
  } catch (e) {
    return finish({ kind: 'error', variable, error: (e as Error).message });
  }
}

const MAX_CACHE = 5000;
const cache = new Map<string, ParsedLine>();

/** Cache misses, for tests that check edits don't re-parse unrelated lines. */
export const parseCacheStats = { misses: 0 };

/**
 * Cached `parseLine`. Parsing depends only on the line text and on the in-scope variables the
 * line mentions, so `scopeKey` should name exactly those (see `VariableNames.relevantKey`).
 * Editing one line then re-parses just that line, plus lines that mention a variable whose
 * definition changed.
 */
export function parseLineCached(
  raw: string,
  vars: ReadonlySet<string>,
  scopeKey: string,
): ParsedLine {
  const key = `${scopeKey}\u0000${raw}`;
  let parsed = cache.get(key);
  if (!parsed) {
    parseCacheStats.misses++;
    if (cache.size >= MAX_CACHE) cache.clear();
    parsed = parseLine(raw, vars);
    cache.set(key, parsed);
  }
  return parsed;
}

const WORDS = /[\p{L}_][\p{L}\p{N}_]*/gu;

/** Indexes variable names by their first word, to find the ones a line could mention. */
export class VariableNames {
  readonly all = new Set<string>();
  private byFirstWord = new Map<string, Set<string>>();

  add(name: string): void {
    if (this.all.has(name)) return;
    this.all.add(name);
    const first = name.split(' ')[0]!;
    let names = this.byFirstWord.get(first);
    if (!names) this.byFirstWord.set(first, (names = new Set()));
    names.add(name);
  }

  delete(name: string): void {
    if (!this.all.delete(name)) return;
    this.byFirstWord.get(name.split(' ')[0]!)?.delete(name);
  }

  /** Cache key covering the variables that could affect how `raw` parses. */
  relevantKey(raw: string): string {
    if (this.all.size === 0) return '';
    const relevant = new Set<string>();
    for (const word of raw.toLowerCase().match(WORDS) ?? []) {
      for (const name of this.byFirstWord.get(word) ?? []) relevant.add(name);
    }
    return [...relevant].sort().join('\u0001');
  }
}
