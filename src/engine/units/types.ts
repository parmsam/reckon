import type { Decimal } from '../values';
import type { Dim } from './dims';

/** Settings and data that unit factors can depend on. */
export interface UnitContext {
  /** Pixels per inch, for px/em/rem. */
  ppi: number;
  /** Size of 1em in px. */
  emPx: number;
  /** Units of each currency per 1 USD. */
  rates?: Readonly<Record<string, number>>;
  /** Density (kg/m³) of the ingredient the line names, for volume ↔ weight conversions. */
  density?: Decimal;
  /** Called when a conversion used an exchange rate. */
  onRate?: () => void;
  /** Factors of units defined in the note ("1 sprint = 2 weeks"), by name. */
  userFactors?: ReadonlyMap<string, (ctx: UnitContext) => Decimal>;
}

export interface UnitDef {
  id: string;
  /** Shown after the number: "km", "°C". */
  symbol: string;
  /** Shown instead of `symbol` when the amount isn't 1: "cups". */
  plural?: string;
  dim: Dim;
  /** Multiplier to the base unit (m, kg, s, K, byte, USD, rad). */
  factor: Decimal | ((ctx: UnitContext) => Decimal);
  /** Affine offset (temperatures): base = (value + offset) × factor. */
  offset?: Decimal;
  /** ISO 4217 code (or ticker, for crypto). */
  currency?: string;
  crypto?: boolean;
  /** Symbols written before the number: `$30`. */
  prefix?: boolean;
  /** For area and volume units: the same unit as a power of a length (m² is m^2). */
  expand?: { id: string; power: number };
}

export interface UnitTerm {
  unit: UnitDef;
  power: number;
}

/** A product of unit powers: km/h is [{km, 1}, {h, -1}]. */
export type UnitExpr = readonly UnitTerm[];
