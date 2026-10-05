import { CURRENCY_UNITS } from './currency';
import { PHYSICAL_UNITS, type UnitSpec } from './registry';
import { setUnitFinder } from './quantity';
import type { UnitDef } from './types';

export { CURRENCY_SYMBOL_CHARS, CRYPTO, isCrypto, BASE_CURRENCY } from './currency';
export type { UnitContext, UnitDef, UnitExpr, UnitTerm } from './types';

const ALL: UnitSpec[] = [...PHYSICAL_UNITS, ...CURRENCY_UNITS];

/** Every unit with its names and symbols, for autocomplete. */
export const UNIT_SPECS: readonly UnitSpec[] = ALL;

const bySymbol = new Map<string, UnitDef>();
const byName = new Map<string, UnitDef>();
/** Lowercased multi-letter symbols that are unambiguous, so "KM" and "Kg" still work. */
const byLowerSymbol = new Map<string, UnitDef | null>();

for (const { def, symbols, names } of ALL) {
  for (const s of symbols) {
    bySymbol.set(s, def);
    // Currencies are excluded: many codes are words in lowercase ("all", "top").
    if (s.length > 1 && !def.currency) {
      const lower = s.toLowerCase();
      const seen = byLowerSymbol.get(lower);
      byLowerSymbol.set(lower, seen === undefined || seen === def ? def : null);
    }
  }
  for (const n of names) byName.set(n, def);
}

export const MAX_UNIT_WORDS = Math.max(...[...byName.keys()].map((n) => n.split(' ').length));

const byId = new Map(ALL.map((s) => [s.def.id, s.def]));

export function getUnit(id: string): UnitDef | undefined {
  return byId.get(id);
}

setUnitFinder(getUnit);

/** Finds a unit by a single word or a multi-word name ("fl oz", "square feet"). */
export function lookupUnit(text: string): UnitDef | undefined {
  if (!text.includes(' ')) {
    const exact = bySymbol.get(text);
    if (exact) return exact;
  }
  const lower = text.toLowerCase();
  return byName.get(lower) ?? byLowerSymbol.get(lower) ?? undefined;
}
