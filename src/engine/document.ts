import { usesAggregate } from './ast';
import { defaultSettings, type Settings } from './context';
import { evaluate } from './evaluate';
import { formatValue } from './format';
import type { Node } from './ast';
import { parseLineCached, ScopeIndex, type Highlight, type Scope } from './line';
import { NO_DIM } from './units/dims';
import { dimOf, exprFactor } from './units/quantity';
import type { UnitDef } from './units';
import { userUnitDef } from './units/user';
import { CalcError, type Decimal } from './values';
import type { UnitContext } from './units';
import type { Value } from './values';

export type LineKind = 'blank' | 'comment' | 'heading' | 'text' | 'value' | 'error' | 'definition';

/** A function defined in the note: `area(w, h) = w × h`. */
export interface UserFunction {
  params: string[];
  body: Node;
}

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
  /** True when the result used an exchange rate. */
  usesRates?: boolean;
  /** True when the line itself uses sum/avg/count/min/max, so totals leave it out. */
  aggregate?: boolean;
}

/**
 * Evaluates a whole note, top to bottom. Each line sees the variables and results of the lines
 * above it. `sum`, `avg`, `count`, `min` and `max` cover the current block: the lines since the
 * last heading or blank line, excluding lines that themselves use an aggregate.
 */
export function evaluateDocument(source: string, settings: Partial<Settings> = {}): LineResult[] {
  const s: Settings = { ...defaultSettings, ...settings };
  const vars = new Map<string, Value>();
  const index = new ScopeIndex();
  const varNames = new Set<string>();
  const functions = new Map<string, UserFunction>();
  const functionNames = new Set<string>();
  const userUnits = new Map<string, UnitDef>();
  const userFactors = new Map<string, (ctx: UnitContext) => Decimal>();
  const scope: Scope = { vars: varNames, functions: functionNames, units: userUnits };
  const results: LineResult[] = [];
  let block: Value[] = [];
  let prev: Value | undefined;
  let usedRates: boolean;
  const units: UnitContext = {
    ppi: s.ppi,
    emPx: s.emPx,
    rates: s.rates,
    onRate: () => (usedRates = true),
    userFactors,
  };

  const setVar = (name: string, value: Value | undefined) => {
    if (value) {
      vars.set(name, value);
      varNames.add(name);
      index.set('v', name);
    } else {
      vars.delete(name);
      varNames.delete(name);
      index.delete('v', name);
    }
  };

  const forgetUnit = (name: string, plural: string) => {
    for (const word of [name, plural]) {
      userUnits.delete(word);
      index.delete('u', word);
    }
    userFactors.delete(name);
  };

  /** `1 sprint = 2 weeks`: the unit is worth `value`. */
  const defineUnit = (name: string, plural: string, value: Value) => {
    let dimension = NO_DIM;
    let factor: (ctx: UnitContext) => Decimal;
    if (value.kind === 'number') {
      factor = () => value.value;
    } else if (value.kind === 'quantity') {
      if (value.unit.some((t) => t.unit.offset))
        throw new CalcError("Units can't be defined from °C or °F");
      dimension = dimOf(value.unit);
      factor = (ctx) => value.value.times(exprFactor(value.unit, ctx));
    } else {
      throw new CalcError('A unit must be a number or an amount with units');
    }
    const def = userUnitDef(name, dimension);
    for (const word of [name, plural]) {
      userUnits.set(word, def);
      index.set('u', word, dimension.join(','));
    }
    userFactors.set(name, factor);
  };

  for (const raw of source.split('\n')) {
    const line = parseLineCached(raw, scope, index.relevantKey(raw));
    const { highlights, variable, define } = line;

    if (define?.kind === 'function') {
      if (line.kind === 'expr') {
        functions.set(define.name, { params: define.params, body: line.ast! });
        functionNames.add(define.name);
        index.set('f', define.name);
        results.push({ kind: 'definition', highlights });
      } else {
        functions.delete(define.name);
        functionNames.delete(define.name);
        index.delete('f', define.name);
        results.push({
          kind: 'error',
          error: line.error ?? 'The function has no body',
          highlights,
        });
      }
      continue;
    }
    if (define?.kind === 'unit' && line.kind !== 'expr') {
      forgetUnit(define.name, define.plural);
      results.push({ kind: 'error', error: line.error ?? 'The unit has no value', highlights });
      continue;
    }

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

    usedRates = false;
    try {
      const value = evaluate(line.ast!, {
        vars,
        prev,
        lineValue: (n) => (n >= 1 && n <= results.length ? results[n - 1]!.value : undefined),
        block,
        settings: s,
        units,
        functions,
      });
      if (define?.kind === 'unit') {
        defineUnit(define.name, define.plural, value);
        results.push({ kind: 'value', value, display: formatValue(value, s), highlights });
        continue;
      }
      prev = value;
      if (variable) setVar(variable, value);
      if (!usesAggregate(line.ast!)) block.push(value);
      const display = formatValue(value, s);
      results.push({
        kind: 'value',
        value,
        display,
        variable,
        highlights,
        usesRates: usedRates || undefined,
        aggregate: usesAggregate(line.ast!) || undefined,
      });
    } catch (e) {
      if (variable) setVar(variable, undefined);
      if (define?.kind === 'unit') forgetUnit(define.name, define.plural);
      const error = e instanceof Error ? e.message : String(e);
      results.push({ kind: 'error', error, variable, highlights });
    }
  }
  return results;
}
