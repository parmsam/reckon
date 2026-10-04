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

/**
 * Cached `parseLine`. Parsing depends only on the line text and the variable names in scope, so
 * editing one line re-parses just that line (and lines whose scope changed).
 */
export function parseLineCached(
  raw: string,
  vars: ReadonlySet<string>,
  varsKey: string,
): ParsedLine {
  const key = `${varsKey}\u0000${raw}`;
  let parsed = cache.get(key);
  if (!parsed) {
    if (cache.size >= MAX_CACHE) cache.clear();
    parsed = parseLine(raw, vars);
    cache.set(key, parsed);
  }
  return parsed;
}
