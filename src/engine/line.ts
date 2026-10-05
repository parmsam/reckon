import type { Node } from './ast';
import { lex } from './lexer';
import { parse } from './parser';
import { RESERVED, resolve, type RToken } from './resolve';
import type { UnitDef } from './units';
import { pluralOf } from './units/user';

export type HighlightType =
  | 'number'
  | 'operator'
  | 'keyword'
  | 'function'
  | 'constant'
  | 'variable'
  | 'unit'
  | 'date'
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

/** What's defined above a line: it decides how the line's words parse. */
export interface Scope {
  vars: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  /** Lowercase unit name (and plural) → unit. */
  units: ReadonlyMap<string, UnitDef>;
}

export const EMPTY_SCOPE: Scope = { vars: new Set(), functions: new Set(), units: new Map() };

/** A definition on this line: `f(x) = …` or `1 sprint = …`. */
export type Definition =
  | { kind: 'function'; name: string; params: string[] }
  | { kind: 'unit'; name: string; plural: string };

/** Everything about a line that doesn't depend on values computed above it. */
export interface ParsedLine {
  kind: 'blank' | 'comment' | 'heading' | 'text' | 'expr' | 'error';
  variable?: string;
  define?: Definition;
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

/** `area(w, h) = w × h` */
const FUNCTION_DEF =
  /^(\s*)([\p{L}_][\p{L}\p{N}_]*)(\s*\(\s*)([\p{L}_][\p{L}\p{N}_]*(?:\s*,\s*[\p{L}_][\p{L}\p{N}_]*)*)\s*\)\s*=(?!=)(.*)$/u;
/** `1 sprint = 2 weeks` */
const UNIT_DEF = /^(\s*1\s+)([\p{L}_][\p{L}\p{N}_]*)\s*=(?!=)(.*)$/u;

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
    case 'unit':
      return 'unit';
    case 'bool':
      return 'constant';
    case 'date':
    case 'zone':
      return 'date';
    case 'until':
      return 'keyword';
    default:
      return 'reference';
  }
}

/** Parses one line, given what's defined above it. */
export function parseLine(raw: string, scope: Scope): ParsedLine {
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

  let vars = scope.vars;
  let functions = scope.functions;
  let define: Definition | undefined;
  const fnDef = FUNCTION_DEF.exec(text);
  const unitDef = fnDef ? null : UNIT_DEF.exec(text);
  if (fnDef && !RESERVED.has(fnDef[2]!.toLowerCase())) {
    const name = fnDef[2]!.toLowerCase();
    const params = fnDef[4]!.split(',').map((p) => p.trim().toLowerCase());
    const nameFrom = offset + fnDef[1]!.length;
    highlights.push({ from: nameFrom, to: nameFrom + fnDef[2]!.length, type: 'function' });
    let at = nameFrom + fnDef[2]!.length + fnDef[3]!.length;
    for (const param of fnDef[4]!.split(',')) {
      const start = at + (param.length - param.trimStart().length);
      highlights.push({ from: start, to: start + param.trim().length, type: 'variable' });
      at += param.length + 1;
    }
    define = { kind: 'function', name, params };
    // The body sees its parameters as variables, and its own name, so it can recurse.
    vars = new Set([...scope.vars, ...params]);
    functions = new Set([...scope.functions, name]);
    const body = fnDef[5]!;
    offset += text.length - body.length;
    text = body;
  } else if (unitDef && !RESERVED.has(unitDef[2]!.toLowerCase())) {
    const name = unitDef[2]!.toLowerCase();
    const nameFrom = offset + unitDef[1]!.length;
    highlights.push({ from: nameFrom, to: nameFrom + unitDef[2]!.length, type: 'unit' });
    define = { kind: 'unit', name, plural: pluralOf(name) };
    const body = unitDef[3]!;
    offset += text.length - body.length;
    text = body;
  }

  let variable: string | undefined;
  const assignment = define ? null : ASSIGNMENT.exec(text);
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
    return { ...line, ...(define && { define }), highlights };
  };

  let tokens: RToken[];
  try {
    tokens = resolve(lex(text, offset), vars, { functions, units: scope.units });
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
export function parseLineCached(raw: string, scope: Scope, scopeKey: string): ParsedLine {
  const key = `${scopeKey}\u0000${raw}`;
  let parsed = cache.get(key);
  if (!parsed) {
    parseCacheStats.misses++;
    if (cache.size >= MAX_CACHE) cache.clear();
    parsed = parseLine(raw, scope);
    cache.set(key, parsed);
  }
  return parsed;
}

const WORDS = /[\p{L}_][\p{L}\p{N}_]*/gu;

/**
 * Indexes what's defined in a note (variables, functions, units) by first word, so a line's cache
 * key can name exactly the definitions it could mention.
 */
export class ScopeIndex {
  /** id ("v:rent", "f:area", "u:sprint") → its part of the cache key. */
  private entries = new Map<string, string>();
  private byFirstWord = new Map<string, Set<string>>();

  /** Records a definition. `detail` goes into the key, so changing it re-parses dependent lines. */
  set(kind: 'v' | 'f' | 'u', name: string, detail = ''): void {
    const id = `${kind}:${name}`;
    this.entries.set(id, `${id}=${detail}`);
    const first = name.split(' ')[0]!;
    let ids = this.byFirstWord.get(first);
    if (!ids) this.byFirstWord.set(first, (ids = new Set()));
    ids.add(id);
  }

  delete(kind: 'v' | 'f' | 'u', name: string): void {
    const id = `${kind}:${name}`;
    if (!this.entries.delete(id)) return;
    this.byFirstWord.get(name.split(' ')[0]!)?.delete(id);
  }

  /** Cache key covering the definitions that could affect how `raw` parses. */
  relevantKey(raw: string): string {
    if (this.entries.size === 0) return '';
    const relevant = new Set<string>();
    for (const word of raw.toLowerCase().match(WORDS) ?? []) {
      for (const id of this.byFirstWord.get(word) ?? []) relevant.add(this.entries.get(id)!);
    }
    return [...relevant].sort().join('\u0001');
  }
}
