import type { Node } from './ast';
import { lex } from './lexer';
import { parse } from './parser';
import { RESERVED, resolve, type RToken, type UserDefinitions } from './resolve';
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
  | 'heading'
  /** A choice option's name, on the choice line and where it's compared. */
  | 'choice';

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
  /** Choice option names (`train`), values only next to `==` and `!=`. */
  symbols?: ReadonlySet<string>;
}

export const EMPTY_SCOPE: Scope = { vars: new Set(), functions: new Set(), units: new Map() };

/** One option of a choice line. Offsets are from the start of the line, inside any brackets. */
export interface ChoiceOption {
  from: number;
  to: number;
  /** The name as written ("Night bus") and normalized ("night bus"). */
  label: string;
  name: string;
}

/** `transport = car | [train] | fly`: its options, which one is current, and where its brackets are. */
export interface Choice {
  options: ChoiceOption[];
  current: number;
  /** Offsets of `[` and `]` around the current option, when it's bracketed. */
  brackets?: [number, number];
  /** True when the options have values (`car $120 | train $80`). */
  valued: boolean;
}

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
  /** Words that were treated as descriptive text and ignored. */
  ignored?: string[];
  error?: string;
  highlights: Highlight[];
  choice?: Choice;
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
    case 'sym':
      return 'choice';
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

  const user = { functions, units: scope.units, symbols: scope.symbols };
  const choice = variable ? parseChoice(text, offset, vars, user, highlights) : undefined;
  if (choice) {
    if ('error' in choice) return finish({ kind: 'error', variable, error: choice.error });
    return finish({ kind: 'expr', variable, ast: choice.ast, choice: choice.choice });
  }

  const parsed = parseExpression(text, offset, vars, user);
  highlights.push(...parsed.highlights);
  if (parsed.error) return finish({ kind: 'error', variable, error: parsed.error });
  if (!parsed.ast) return finish({ kind: 'text', variable });
  const { ast, ignored } = parsed;
  return finish({ kind: 'expr', variable, ast, ...(ignored.length && { ignored }) });
}

interface ParsedExpression {
  ast?: Node;
  error?: string;
  ignored: string[];
  highlights: Highlight[];
}

/** Lexes, resolves and parses `text`, which starts `offset` characters into the line. */
function parseExpression(
  text: string,
  offset: number,
  vars: ReadonlySet<string>,
  user: UserDefinitions,
): ParsedExpression {
  let tokens: RToken[];
  let lexed: ReturnType<typeof lex>;
  try {
    lexed = lex(text, offset);
    tokens = resolve(lexed, vars, user);
  } catch (e) {
    return { error: (e as Error).message, ignored: [], highlights: [] };
  }
  const highlights = tokens.map((t) => ({ from: t.from, to: t.to, type: tokenHighlight(t) }));
  if (tokens.length === 0) return { ignored: [], highlights };
  const ignored = lexed
    .filter((t) => t.type === 'word' && !tokens.some((r) => r.from <= t.from && t.to <= r.to))
    .map((t) => t.text);
  try {
    return { ast: parse(tokens), ignored, highlights };
  } catch (e) {
    return { error: (e as Error).message, ignored, highlights };
  }
}

const OPTION_NAME = /^[\p{L}_][\p{L}\p{N}_]*(?:\s+[\p{L}_][\p{L}\p{N}_]*)*/u;

/**
 * `car | [train] | fly` or `car $120 | [train $80]`: a choice, when there are two or more
 * options and each starts with a name that isn't a variable or function. Anything else (`5 | 3`,
 * `a | b` with variables) is left to the expression parser, as bitwise or.
 */
function parseChoice(
  text: string,
  offset: number,
  vars: ReadonlySet<string>,
  user: UserDefinitions,
  highlights: Highlight[],
): { choice: Choice; ast: Node } | { error: string } | undefined {
  if (!text.includes('|') || text.includes('||')) return undefined;
  // Split on `|` outside parentheses.
  const parts: { from: number; text: string }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (i === text.length || (c === '|' && depth === 0)) {
      parts.push({ from: start, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  if (parts.length < 2) return undefined;

  const taken = (word: string) => {
    const w = word.toLowerCase();
    return vars.has(w) || user.functions?.has(w) || [...vars].some((v) => v.startsWith(`${w} `));
  };
  const options: (ChoiceOption & { value: string; valueFrom: number })[] = [];
  const bracketed: number[] = [];
  let brackets: [number, number] | undefined;
  for (const part of parts) {
    const lead = part.text.length - part.text.trimStart().length;
    let body = part.text.trim();
    let from = offset + part.from + lead;
    if (body.startsWith('[') && body.endsWith(']')) {
      bracketed.push(options.length);
      brackets = [from, from + body.length - 1];
      body = body.slice(1, -1);
      from += 1;
      const inner = body.length - body.trimStart().length;
      body = body.trim();
      from += inner;
    }
    if (body.includes('[') || body.includes(']')) return undefined;
    // The name: leading words, up to the first variable or function.
    const words = OPTION_NAME.exec(body)?.[0].split(/(\s+)/) ?? [];
    let label = '';
    for (let k = 0; k < words.length; k += 2) {
      if (taken(words[k]!)) break;
      label = words.slice(0, k + 1).join('');
    }
    const name = normalizeName(label);
    if (!name || name === 'true' || name === 'false') return undefined;
    const rest = body.slice(label.length);
    options.push({
      from,
      to: from + body.length,
      label,
      name,
      value: rest,
      valueFrom: from + label.length,
    });
  }

  const ownHighlights: Highlight[] = [];
  for (const o of options) {
    ownHighlights.push({ from: o.from, to: o.from + o.label.length, type: 'choice' });
  }
  for (const part of parts.slice(1)) {
    const bar = offset + part.from - 1;
    ownHighlights.push({ from: bar, to: bar + 1, type: 'operator' });
  }
  if (brackets) {
    ownHighlights.push({ from: brackets[0], to: brackets[0] + 1, type: 'operator' });
    ownHighlights.push({ from: brackets[1], to: brackets[1] + 1, type: 'operator' });
  }

  const valued = options.filter((o) => o.value.trim()).length;
  const fail = (error: string) => {
    highlights.push(...ownHighlights);
    return { error };
  };
  if (bracketed.length > 1) return fail('Only one option can be the current one');
  if (valued && valued < options.length) return fail('Give every option a value, or none');
  if (new Set(options.map((o) => o.name)).size < options.length) {
    return fail('Each option needs its own name');
  }

  const current = bracketed[0] ?? 0;
  let ast: Node | undefined;
  for (const [k, o] of options.entries()) {
    if (!valued) continue;
    const parsed = parseExpression(o.value, o.valueFrom, vars, user);
    ownHighlights.push(...parsed.highlights);
    if (parsed.error || !parsed.ast) return fail(parsed.error ?? `"${o.label}" has no value`);
    if (k === current) ast = parsed.ast;
  }
  highlights.push(...ownHighlights);
  const chosen = options[current]!;
  return {
    choice: {
      options: options.map(({ from, to, label, name }) => ({ from, to, label, name })),
      current,
      ...(brackets && { brackets }),
      valued: valued > 0,
    },
    ast: ast ?? { k: 'symbol', name: chosen.name, label: chosen.label },
  };
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
  /** id ("v:rent", "f:area", "u:sprint", "s:train") → its part of the cache key. */
  private entries = new Map<string, string>();
  private byFirstWord = new Map<string, Set<string>>();

  /** Records a definition. `detail` goes into the key, so changing it re-parses dependent lines. */
  set(kind: 'v' | 'f' | 'u' | 's', name: string, detail = ''): void {
    const id = `${kind}:${name}`;
    this.entries.set(id, `${id}=${detail}`);
    const first = name.split(' ')[0]!;
    let ids = this.byFirstWord.get(first);
    if (!ids) this.byFirstWord.set(first, (ids = new Set()));
    ids.add(id);
  }

  delete(kind: 'v' | 'f' | 'u' | 's', name: string): void {
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
