import { D, type Decimal } from '../values';

/** One US cup in m³. */
const CUP = new D('0.0002365882365');

/**
 * Common cooking ingredients and their densities, so a line that names one can convert between
 * volume and weight (`2 cups flour in g`). Dry goods use typical baking-chart weights for a spooned
 * and levelled US cup; liquids use their physical density. Answers are approximate.
 */
const INGREDIENTS: [names: string, gramsPerCup: Decimal.Value][] = [
  ['flour, all-purpose flour, plain flour, bread flour', 120],
  ['whole wheat flour, wholemeal flour', 113],
  ['sugar, granulated sugar, white sugar, caster sugar', 198],
  ['brown sugar', 213],
  ["powdered sugar, icing sugar, confectioners' sugar, confectioners sugar", 113],
  ['butter', 227],
  ['cocoa, cocoa powder', 84],
  ['oats, rolled oats', 89],
  ['water', CUP.times(1e6)],
  ['milk', CUP.times(1.03e6)],
  ['honey, maple syrup', 336],
  ['oil, olive oil, vegetable oil', CUP.times(0.92e6)],
];

/** Density in kg/m³, by name. */
const DENSITY = new Map<string, Decimal>();
for (const [names, grams] of INGREDIENTS) {
  const density = new D(grams).div(1000).div(CUP);
  for (const name of names.split(', ')) DENSITY.set(name, density);
}
const LONGEST_FIRST = [...DENSITY.keys()].sort((a, b) => b.length - a.length);

/** Every ingredient, with its names, for the glossary. */
export function ingredientNames(): string[][] {
  return INGREDIENTS.map(([names]) => names.split(', '));
}

/**
 * The density (kg/m³) of the one ingredient a line mentions, or undefined when it names none, or
 * more than one with different densities. Longer names win, so "brown sugar" isn't "sugar".
 */
export function ingredientDensity(line: string): Decimal | undefined {
  let text = ` ${line.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ')} `;
  let found: Decimal | undefined;
  for (const name of LONGEST_FIRST) {
    if (!text.includes(` ${name} `)) continue;
    const density = DENSITY.get(name)!;
    if (found && !found.equals(density)) return undefined;
    found = density;
    text = text.replaceAll(` ${name} `, '  ');
  }
  return found;
}
