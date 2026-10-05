import { CalcError, D, type Decimal } from '../values';
import { addDims, dim, isDimensionless, NO_DIM, sameDim, type Dim } from './dims';
import type { UnitContext, UnitDef, UnitExpr, UnitTerm } from './types';

const VOLUME = dim({ length: 3 });
const MASS = dim({ mass: 1 });

/** Set by index.ts, which owns the registry (avoids an import cycle). */
let findUnit: (id: string) => UnitDef | undefined = () => undefined;
export function setUnitFinder(fn: (id: string) => UnitDef | undefined): void {
  findUnit = fn;
}

/** m² becomes m^2, so it can cancel against m. */
export function expand(expr: UnitExpr): UnitTerm[] {
  return expr.map((t) => {
    const base = t.unit.expand && findUnit(t.unit.expand.id);
    return base ? { unit: base, power: t.power * t.unit.expand!.power } : { ...t };
  });
}

function factorOf(unit: UnitDef, ctx: UnitContext): Decimal {
  return typeof unit.factor === 'function' ? unit.factor(ctx) : unit.factor;
}

export function dimOf(expr: UnitExpr): Dim {
  return expr.reduce<Dim>((d, t) => addDims(d, t.unit.dim, t.power), NO_DIM);
}

/** Multiplier from a unit expression to base units (m, kg, s, USD…). */
export function exprFactor(expr: UnitExpr, ctx: UnitContext): Decimal {
  return expr.reduce((f, t) => f.times(factorOf(t.unit, ctx).pow(t.power)), new D(1));
}

/** Temperatures in °C/°F convert with an offset, but only as a plain unit (not in °C/s). */
function affine(expr: UnitExpr): UnitDef | undefined {
  const only = expr.length === 1 ? expr[0]! : undefined;
  return only && only.power === 1 && only.unit.offset ? only.unit : undefined;
}

export function sameExpr(a: UnitExpr, b: UnitExpr): boolean {
  return (
    a.length === b.length && a.every((t, i) => t.unit === b[i]!.unit && t.power === b[i]!.power)
  );
}

export function compatible(a: UnitExpr, b: UnitExpr): boolean {
  return sameDim(dimOf(a), dimOf(b));
}

function toBase(value: Decimal, expr: UnitExpr, ctx: UnitContext): Decimal {
  const a = affine(expr);
  if (a) return value.plus(a.offset!).times(factorOf(a, ctx));
  return value.times(exprFactor(expr, ctx));
}

function fromBase(value: Decimal, expr: UnitExpr, ctx: UnitContext): Decimal {
  const a = affine(expr);
  if (a) return value.div(factorOf(a, ctx)).minus(a.offset!);
  return value.div(exprFactor(expr, ctx));
}

/** Converts `value` from one unit to another. Throws if the dimensions differ. */
export function convert(value: Decimal, from: UnitExpr, to: UnitExpr, ctx: UnitContext): Decimal {
  if (sameExpr(from, to)) return value;
  // 2 cups flour in g: volume and weight convert through the line's ingredient.
  if (ctx.density) {
    const [a, b] = [dimOf(from), dimOf(to)];
    if (sameDim(a, VOLUME) && sameDim(b, MASS))
      return fromBase(toBase(value, from, ctx).times(ctx.density), to, ctx);
    if (sameDim(a, MASS) && sameDim(b, VOLUME))
      return fromBase(toBase(value, from, ctx).div(ctx.density), to, ctx);
  }
  if (!compatible(from, to)) {
    throw new CalcError(`Can't convert ${formatUnit(from)} to ${formatUnit(to)}`);
  }
  return fromBase(toBase(value, from, ctx), to, ctx);
}

/**
 * Multiplies two unit expressions. Terms of the same kind are merged into the left-hand unit
 * (m × cm becomes m², with `scale` carrying the cm→m factor), and cancelled terms disappear,
 * so $/h × h is just $.
 */
export function multiplyUnits(
  a: UnitExpr,
  b: UnitExpr,
  ctx: UnitContext,
): { expr: UnitExpr; scale: Decimal } {
  // Expand m², ft³… only when there's something to combine with.
  const combine = a.length > 0 && b.length > 0;
  const terms: UnitTerm[] = combine ? expand(a) : a.map((t) => ({ ...t }));
  let scale = new D(1);
  for (const t of combine ? expand(b) : b) {
    const same = terms.find((x) => x.unit === t.unit);
    if (same) {
      same.power += t.power;
      continue;
    }
    const kin = terms.find(
      (x) => sameDim(x.unit.dim, t.unit.dim) && !x.unit.offset && !t.unit.offset,
    );
    if (kin) {
      scale = scale.times(factorOf(t.unit, ctx).div(factorOf(kin.unit, ctx)).pow(t.power));
      kin.power += t.power;
      continue;
    }
    terms.push({ ...t });
  }
  return { expr: terms.filter((t) => t.power !== 0), scale };
}

export function powerUnits(expr: UnitExpr, power: number): UnitExpr {
  return expr.map((t) => ({ unit: t.unit, power: t.power * power }));
}

export function isUnitless(expr: UnitExpr): boolean {
  return expr.length === 0 || isDimensionless(dimOf(expr));
}

const SUPERSCRIPTS: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
const superscript = (n: number) => [...String(n)].map((c) => SUPERSCRIPTS[c] ?? c).join('');

/** Formats a unit: "km", "km/h", "m²", "kg·m/s²". `plural` picks "cups" over "cup". */
export function formatUnit(expr: UnitExpr, plural = false): string {
  if (expr.length === 1 && expr[0]!.power === 1) {
    const u = expr[0]!.unit;
    return plural && u.plural ? u.plural : u.symbol;
  }
  const term = (t: UnitTerm, power: number) =>
    t.unit.symbol + (power === 1 ? '' : superscript(power));
  const num = expr.filter((t) => t.power > 0).map((t) => term(t, t.power));
  const den = expr.filter((t) => t.power < 0);
  if (!num.length) return expr.map((t) => term(t, t.power)).join('·');
  const denominator = den.map((t) => term(t, -t.power)).join('·');
  return (
    num.join('·') + (den.length ? `/${den.length > 1 ? `(${denominator})` : denominator}` : '')
  );
}
