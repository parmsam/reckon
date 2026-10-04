/** Base dimensions. A unit's dimension is a vector of exponents over these. */
export const DIMENSIONS = [
  'length',
  'mass',
  'time',
  'temperature',
  'data',
  'currency',
  'angle',
] as const;

export type Dim = readonly number[];

export const NO_DIM: Dim = DIMENSIONS.map(() => 0);

/** Builds a dimension vector: dim({ length: 1, time: -1 }) for speed. */
export function dim(exponents: Partial<Record<(typeof DIMENSIONS)[number], number>>): Dim {
  return DIMENSIONS.map((d) => exponents[d] ?? 0);
}

export function addDims(a: Dim, b: Dim, scale = 1): Dim {
  return a.map((x, i) => x + b[i]! * scale);
}

export function sameDim(a: Dim, b: Dim): boolean {
  return a.every((x, i) => x === b[i]);
}

export function isDimensionless(d: Dim): boolean {
  return sameDim(d, NO_DIM);
}
