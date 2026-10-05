import { CalcError } from '../values';
import type { Dim } from './dims';
import type { UnitDef } from './types';

/**
 * Units defined in a note ("1 sprint = 2 weeks"). Definitions are interned by name and dimension,
 * so a cached parse that refers to one stays valid; the factor is looked up when it's used, so it
 * follows changes to the definition's value (and to exchange rates).
 */
const defs = new Map<string, UnitDef>();

export function userUnitDef(name: string, dim: Dim): UnitDef {
  const key = `${name}|${dim.join(',')}`;
  let def = defs.get(key);
  if (!def) {
    def = {
      id: `user:${name}`,
      symbol: name,
      plural: pluralOf(name),
      dim,
      factor: (ctx) => {
        const factor = ctx.userFactors?.get(name);
        if (!factor) throw new CalcError(`${name} isn't defined`);
        return factor(ctx);
      },
    };
    defs.set(key, def);
  }
  return def;
}

/** "sprint" → "sprints"; names already ending in s stay as they are. */
export function pluralOf(name: string): string {
  return /s$/i.test(name) ? name : `${name}s`;
}
