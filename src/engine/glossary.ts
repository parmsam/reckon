import {
  MONTHS,
  PLACE_ALIASES,
  TODAY_WORDS,
  WEEKDAY_ABBREVIATIONS,
  WEEKDAYS,
  ZONE_ABBREVIATIONS,
} from './dates';
import { CONSTANTS, FUNCTION_ALIASES, FUNCTIONS } from './functions';
import { FRACTIONS, OP_ALIASES, SUFFIXES } from './lexer';
import {
  AGGREGATES,
  CONVERSIONS,
  OP_WORDS,
  PERCENT_WORDS,
  PREV_WORDS,
  SCALES,
  TARGETS,
} from './resolve';
import { CRYPTO, UNIT_SPECS } from './units';
import { ISO_CODES, LOWERCASE_CODES, NAMES, SYMBOLS } from './units/currency';
import { dim, sameDim } from './units/dims';

/**
 * Everything Reckon understands, as data for the docs and llms-full.txt. Word lists come from the
 * parser's own tables, so they can't drift; tests check that every word the parser accepts is
 * listed and that every example has an answer.
 */

export interface GlossaryEntry {
  /** Words or symbols, synonyms together: ["avg", "average", "mean"]. */
  terms: string[];
  meaning: string;
  /** Lines that use it; the docs show the last line's answer. */
  example?: string;
}

export interface GlossaryGroup {
  id: string;
  title: string;
  intro?: string;
  entries: GlossaryEntry[];
}

/** Keys of `table` grouped by their value: { sum: 'sum', total: 'sum' } → { sum: ['sum', 'total'] }. */
function byValue<V extends string | number>(table: Record<string, V>): Map<V, string[]> {
  const groups = new Map<V, string[]>();
  for (const [key, value] of Object.entries(table))
    groups.set(value, [...(groups.get(value) ?? []), key]);
  return groups;
}

const OP_MEANINGS: Record<string, [string, string]> = {
  '+': ['Add', '5 plus 3'],
  '-': ['Subtract', '5 minus 3'],
  '*': ['Multiply', '5 times 3'],
  '/': ['Divide', '10 divided by 4'],
  mod: ['Remainder after division', '10 mod 3'],
};

const AGGREGATE_MEANINGS: Record<string, string> = {
  sum: 'Adds up the answers above, back to the last heading or blank line',
  avg: 'Average of the answers above',
  count: 'How many answers are above',
  min: 'Smallest answer above (min(…) with parentheses is the function)',
  max: 'Largest answer above (max(…) with parentheses is the function)',
};

const TARGET_MEANINGS: Record<string, [string, string]> = {
  hex: ['Show in hexadecimal', '255 in hex'],
  bin: ['Show in binary', '10 in binary'],
  oct: ['Show in octal', '8 as oct'],
  sci: ['Show in scientific notation', '1500 in sci'],
  dec: ['Show as a plain decimal again', '0xFF in dec'],
  percent: ['Show as a percentage', '0.25 as %'],
};

/** Descriptions for every function. A test checks none is missing. */
export const FUNCTION_DOCS: Record<string, [string, string]> = {
  sqrt: ['Square root (also of areas: sqrt(16 m²) = 4 m)', 'sqrt(16)'],
  cbrt: ['Cube root', 'cbrt(27)'],
  root: ['nth root: root(x, n)', 'root(16, 4)'],
  abs: ['Absolute value', 'abs(-5)'],
  round: ['Round, optionally to n decimal places: round(x, n)', 'round(3.14159, 2)'],
  floor: ['Round down', 'floor(2.7)'],
  ceil: ['Round up', 'ceil(2.1)'],
  trunc: ['Drop the decimals', 'trunc(-2.7)'],
  sin: ['Sine (degrees by default; also takes angles: sin(pi rad))', 'sin(30)'],
  cos: ['Cosine', 'cos(60)'],
  tan: ['Tangent', 'tan(45)'],
  asin: ['Inverse sine', 'asin(1)'],
  acos: ['Inverse cosine', 'acos(0)'],
  atan: ['Inverse tangent', 'atan(1)'],
  sinh: ['Hyperbolic sine', 'sinh(0)'],
  cosh: ['Hyperbolic cosine', 'cosh(0)'],
  tanh: ['Hyperbolic tangent', 'tanh(0)'],
  ln: ['Natural logarithm', 'ln(e)'],
  log: ['Logarithm, base 10 or log(x, base)', 'log(8, 2)'],
  log2: ['Base-2 logarithm', 'log2(1024)'],
  exp: ['e to the power of x', 'exp(1)'],
  fact: ['Factorial (same as x!)', 'fact(5)'],
  min: ['Smallest of the arguments (units convert)', 'min(3 m, 250 cm)'],
  max: ['Largest of the arguments', 'max(4, 9, 2)'],
  sum: ['Sum of the arguments', 'sum(1, 2, 3)'],
  avg: ['Average of the arguments', 'avg(2, 4)'],
};

const CONSTANT_MEANINGS: Record<string, string> = {
  pi: 'π, 3.14159…',
  tau: 'τ = 2π',
  e: "Euler's number, 2.71828…",
  phi: 'The golden ratio φ, 1.61803…',
};

const unique = (xs: string[]) => [...new Set(xs)];

export function glossary(): GlossaryGroup[] {
  const ops = byValue(OP_WORDS);
  const aggregates = byValue(AGGREGATES);
  const targets = byValue(TARGETS);
  const functionAliases = byValue(FUNCTION_ALIASES);
  const constants = byValue(
    Object.fromEntries(Object.keys(CONSTANTS).map((k) => [k, CONSTANTS[k]!.toString()])),
  );
  const symbolsFor = (op: string) => [
    op,
    ...Object.keys(OP_ALIASES).filter((k) => OP_ALIASES[k] === op),
  ];
  const monthNames = Object.keys(MONTHS);
  const weekdayNames = Object.keys(WEEKDAYS);

  return [
    {
      id: 'structure',
      title: 'Lines and structure',
      intro: 'Each line is one calculation. These shape a note.',
      entries: [
        {
          terms: ['# Heading'],
          meaning: 'A heading: starts a section and resets sum, avg and the other totals',
        },
        {
          terms: ['// comment'],
          meaning: 'A comment, at the start or end of a line',
          example: '5 + 5 // ten',
        },
        {
          terms: ['label:'],
          meaning: 'Text before a colon is a label and is ignored',
          example: 'rent: 1,200',
        },
        {
          terms: ['name = value'],
          meaning: 'Defines a variable; names can have spaces',
          example: 'tax rate = 8%',
        },
        { terms: ['(blank line)'], meaning: 'Ends a block, so the next sum starts again' },
        {
          terms: ['other words'],
          meaning:
            'Descriptive words around numbers are ignored, unless they sit where a value belongs',
          example: '3 apples + 2 apples',
        },
      ],
    },
    {
      id: 'numbers',
      title: 'Numbers',
      entries: [
        {
          terms: ['1,000', '1_000'],
          meaning: 'Thousands separators (commas only outside parentheses)',
          example: '1,000,000 + 1_000',
        },
        { terms: ['1.5e3', '2.5E-3'], meaning: 'Scientific notation', example: '1.5e3' },
        {
          terms: Object.keys(SUFFIXES),
          meaning: 'Suffixes written right after a number: thousand, million, billion',
          example: '1.5k + 2M',
        },
        { terms: Object.keys(SCALES), meaning: 'Scale words after a number', example: '2 million' },
        {
          terms: ['0x…', '0b…', '0o…'],
          meaning: 'Hexadecimal, binary and octal numbers',
          example: '0xFF + 0b1010',
        },
        {
          terms: Object.keys(FRACTIONS),
          meaning: 'Fraction characters, alone or after a whole number',
          example: '1 ½ + ¼',
        },
      ],
    },
    {
      id: 'operators',
      title: 'Operators',
      intro: 'Symbols and their word forms. Multiplication can also be implied: 2(3 + 4), 2pi.',
      entries: [
        { terms: symbolsFor('+'), meaning: 'Add', example: '2 + 3' },
        { terms: symbolsFor('-'), meaning: 'Subtract, or make negative', example: '10 − 4' },
        { terms: symbolsFor('*'), meaning: 'Multiply', example: '6 × 7' },
        { terms: symbolsFor('/'), meaning: 'Divide', example: '10 ÷ 4' },
        { terms: ['^', '**', '²', '³'], meaning: 'Power', example: '2^10' },
        { terms: ['!'], meaning: 'Factorial', example: '5!' },
        { terms: ['( )'], meaning: 'Grouping', example: '(2 + 3) × 4' },
        { terms: ['=', '(at the end)'], meaning: 'A trailing = is ignored', example: '2 + 2 =' },
        ...[...ops].map(([op, words]) => ({
          terms: words.map((w) => (w === 'divided' || w === 'multiplied' ? `${w} by` : w)),
          meaning: OP_MEANINGS[op]![0],
          example: OP_MEANINGS[op]![1],
        })),
        { terms: ['x'], meaning: 'Times, when it sits between two numbers', example: '3 x 4' },
        { terms: ['per'], meaning: 'Divides: km per hour', example: '100 km per 2 h' },
        { terms: ['&'], meaning: 'Bitwise and (whole numbers)', example: '0xFF & 0x0F' },
        { terms: ['|'], meaning: 'Bitwise or', example: '0xF0 | 0x0F' },
        { terms: ['xor'], meaning: 'Bitwise exclusive or', example: '5 xor 3' },
        { terms: ['<<', '>>'], meaning: 'Shift bits left or right', example: '1 << 10' },
      ],
    },
    {
      id: 'percentages',
      title: 'Percentages',
      entries: [
        { terms: ['%', ...PERCENT_WORDS], meaning: 'A percentage', example: '20 percent' },
        { terms: ['of'], meaning: 'Percentage of an amount', example: '20% of 50' },
        {
          terms: ['+ %', '- %'],
          meaning: 'Add or subtract a percentage of the amount',
          example: '50 + 10%',
        },
        { terms: ['off'], meaning: 'Discount', example: '10% off $80' },
        { terms: ['on'], meaning: 'Markup', example: '10% on 50' },
        {
          terms: ['as % of', 'as a % of'],
          meaning: 'What percentage one amount is of another',
          example: '5 as % of 20',
        },
        { terms: ['is what % of'], meaning: 'Same, as a question', example: '5 is what % of 20' },
        {
          terms: ['% of what is'],
          meaning: 'The whole, from a part and its percentage',
          example: '20% of what is 5',
        },
      ],
    },
    {
      id: 'logic',
      title: 'Comparisons and conditions',
      intro:
        'Comparisons answer true or false. Units, currencies and dates convert before comparing.',
      entries: [
        {
          terms: ['<', '>', '<=', '>=', '≤', '≥'],
          meaning: 'Less than, greater than, or equal',
          example: '5 km > 3 miles',
        },
        {
          terms: ['==', '!=', '≠'],
          meaning: 'Equal, not equal (decimals are exact)',
          example: '0.1 + 0.2 == 0.3',
        },
        { terms: ['and', '&&'], meaning: 'Both are true', example: '5 > 3 and 2 > 1' },
        { terms: ['or', '||'], meaning: 'Either is true', example: '5 > 30 or 2 > 1' },
        { terms: ['not'], meaning: 'The opposite', example: 'not 5 > 3' },
        { terms: ['true', 'false'], meaning: 'True and false values', example: 'member = true' },
        {
          terms: ['if … then … else …'],
          meaning: 'Picks a value by a condition; without else, false shows no answer',
          example: 'price = $120\nif price > $100 then 10% off price else price',
        },
      ],
    },
    {
      id: 'definitions',
      title: 'Your own functions and units',
      intro: 'Definitions apply to the lines below them.',
      entries: [
        {
          terms: ['name(x) = …', 'name(x, y) = …'],
          meaning: 'Defines a function; it can use variables above it and call itself',
          example: 'area(w, h) = w × h\narea(3 m, 4 m)',
        },
        {
          terms: ['1 name = …'],
          meaning:
            'Defines a unit (the plural works too). It can replace a built-in one, like a metric cup',
          example: '1 sprint = 2 weeks\n3 sprints in days',
        },
      ],
    },
    {
      id: 'totals',
      title: 'Totals and references',
      entries: [
        ...[...aggregates].map(([name, words]) => ({
          terms: words,
          meaning: AGGREGATE_MEANINGS[name]!,
          example: `10\n20\n${words[0]}`,
        })),
        { terms: [...PREV_WORDS], meaning: 'The previous answer', example: '10\nprev × 2' },
        {
          terms: ['line3', 'line 3'],
          meaning: 'The answer on line 3 (any line number)',
          example: '7\n8\nline1 × 10',
        },
      ],
    },
    {
      id: 'conversions',
      title: 'Conversions and formats',
      intro:
        'Convert with any of these words, followed by a unit, a currency, a time zone or a format.',
      entries: [
        {
          terms: [...CONVERSIONS],
          meaning: 'Convert: 5 km in miles, $30 to EUR, now in Tokyo',
          example: '5 km in miles',
        },
        ...[...targets].map(([target, words]) => ({
          terms: target === 'percent' ? ['%', ...words] : words,
          meaning: TARGET_MEANINGS[target]![0],
          example: TARGET_MEANINGS[target]![1],
        })),
      ],
    },
    {
      id: 'functions',
      title: 'Functions',
      intro: 'Write function(argument), or leave out the parentheses for one argument: sqrt 16.',
      entries: Object.keys(FUNCTIONS).map((name) => ({
        terms: [name, ...(functionAliases.get(name) ?? [])],
        meaning: FUNCTION_DOCS[name]?.[0] ?? '',
        example: FUNCTION_DOCS[name]?.[1],
      })),
    },
    {
      id: 'constants',
      title: 'Constants',
      entries: [...constants.values()].map((names) => ({
        terms: names,
        meaning: CONSTANT_MEANINGS[names[0]!] ?? '',
        example: `2 × ${names[0]}`,
      })),
    },
    {
      id: 'dates',
      title: 'Dates and times',
      intro:
        'Dates and times can be combined ("tomorrow at 9am", "Dec 25 3pm") and followed by a time zone ("3pm PST").',
      entries: [
        { terms: Object.keys(TODAY_WORDS), meaning: 'Relative days', example: 'tomorrow' },
        { terms: ['now'], meaning: 'The current date and time', example: 'now + 3 h' },
        { terms: weekdayNames, meaning: 'The next such day (today counts)', example: 'friday' },
        {
          terms: ['next …', 'last …', 'this …'],
          meaning: `Before a weekday (abbreviations work here: ${Object.keys(WEEKDAY_ABBREVIATIONS).join(', ')}), or next/last before week, month, year`,
          example: 'next monday',
        },
        {
          terms: monthNames,
          meaning: 'Months, with a day: Dec 25, December 25th, 2027, 25 Dec, 3rd of March',
          example: 'Dec 25',
        },
        {
          terms: ['2026-07-04', '2026-07-04T09:30'],
          meaning: 'ISO dates, with an optional time',
          example: '2026-07-04',
        },
        {
          terms: ['3pm', '3:30 pm', '11 a.m.', '15:45'],
          meaning: '12- and 24-hour times',
          example: '3:30 pm',
        },
        { terms: ['noon', 'midday', 'midnight'], meaning: 'Named times', example: 'noon' },
        { terms: ['at'], meaning: 'Joins a date and a time', example: 'tomorrow at 9am' },
        {
          terms: ['+ duration', '- duration'],
          meaning: 'Move a date or time; months follow the calendar',
          example: 'today + 2 weeks',
        },
        {
          terms: ['date - date'],
          meaning: 'Time between: days for dates, hours for times',
          example: 'Dec 25 - today',
        },
        { terms: ['ago'], meaning: 'Before now', example: '3 days ago' },
        { terms: ['later', 'in …'], meaning: 'After now', example: 'in 45 min' },
        { terms: ['from'], meaning: 'After a given date', example: '2 weeks from today' },
        {
          terms: ['until', 'till', 'since'],
          meaning: 'Time to or from a date, after a unit ("days until") or "time"',
          example: 'days until Dec 25',
        },
      ],
    },
    {
      id: 'time-zones',
      title: 'Time zones',
      intro:
        'Convert with in or to ("3pm PST in London"), or write "time in Tokyo" for the current time there.',
      entries: [
        ...[...byValue(ZONE_ABBREVIATIONS)].map(([zone, abbreviations]) => ({
          terms: abbreviations,
          meaning: zone.replace(/_/g, ' '),
        })),
        {
          terms: ['UTC', 'GMT'],
          meaning: 'Coordinated Universal Time',
          example: 'noon UTC in New York',
        },
        {
          terms: ['time in …'],
          meaning: 'The current time somewhere',
          example: 'time in New York',
        },
        {
          terms: ['UTC+5', 'GMT-3', 'UTC+5:30'],
          meaning: 'Fixed offsets',
          example: '3pm in UTC+5:30',
        },
        {
          terms: unique(Object.keys(PLACE_ALIASES).filter((p) => p !== 'utc' && p !== 'gmt')),
          meaning:
            'Places and countries, plus every city in the time zone database (Lisbon, Denver, Nairobi…)',
          example: 'time in Tokyo',
        },
      ],
    },
    {
      id: 'currencies',
      title: 'Currencies',
      intro: `Put a symbol or code before or after the amount ($30, 30 USD, EUR 20). All ${ISO_CODES.length} ISO codes work in uppercase; common ones also in lowercase.`,
      entries: [
        ...[...byValue(SYMBOLS)].map(([code, symbols]) => ({
          terms: symbols,
          meaning: code,
          example: `${symbols[0]}100`,
        })),
        ...Object.entries(NAMES).map(([code, names]) => ({
          terms: names.split(',').map((n) => n.trim()),
          meaning: code,
        })),
        {
          terms: [...LOWERCASE_CODES],
          meaning: 'Codes that also work in lowercase',
          example: '100 eur in usd',
        },
        ...Object.entries(CRYPTO).map(([code, { names }]) => ({
          terms: [
            code,
            ...names
              .split(',')
              .map((n) => n.trim())
              .filter(Boolean),
          ],
          meaning: `Crypto (${code})`,
        })),
        {
          terms: ['sat', 'sats', 'satoshi', 'satoshis'],
          meaning: 'Satoshis: 0.00000001 BTC',
          example: '100k sats in USD',
        },
      ],
    },
    {
      id: 'context',
      title: 'Words that depend on context',
      entries: [
        {
          terms: ['in'],
          meaning:
            'Converts when a unit, format or place follows; otherwise inches right after a number',
          example: '6 ft 2 in',
        },
        {
          terms: ['min'],
          meaning: 'Minutes after an amount; otherwise the smallest answer above',
          example: '5 min',
        },
        { terms: ['x'], meaning: 'Times between two numbers; otherwise a variable, if defined' },
        { terms: ['may'], meaning: 'A month only when a day follows (may 5)' },
        {
          terms: ['sat', 'sun'],
          meaning:
            'sat means satoshis. Weekday abbreviations (sat, sun, mon…) only count after next, last or this',
          example: 'next sat',
        },
        {
          terms: ['now', 'today'],
          meaning: 'Ordinary words when a number follows them directly ("I now have 5")',
        },
        {
          terms: ['and', 'or', 'not', 'if'],
          meaning:
            'Logic words only between or before values, and if only with a then; otherwise they are text ("salt and pepper")',
        },
        {
          terms: ['any name'],
          meaning: 'Variables win over units and keywords: after F = 5, "72 F" is 72 × 5',
        },
      ],
    },
  ];
}

const UNIT_KINDS: [string, ReturnType<typeof dim>][] = [
  ['Length', dim({ length: 1 })],
  ['Area', dim({ length: 2 })],
  ['Volume', dim({ length: 3 })],
  ['Mass', dim({ mass: 1 })],
  ['Time', dim({ time: 1 })],
  ['Temperature', dim({ temperature: 1 })],
  ['Data', dim({ data: 1 })],
  ['Angle', dim({ angle: 1 })],
  ['Speed', dim({ length: 1, time: -1 })],
  ['Energy', dim({ mass: 1, length: 2, time: -2 })],
  ['Power', dim({ mass: 1, length: 2, time: -3 })],
  ['Pressure', dim({ mass: 1, length: -1, time: -2 })],
  ['Force', dim({ mass: 1, length: 1, time: -2 })],
  ['Frequency', dim({ time: -1 })],
];

export interface UnitCatalogKind {
  kind: string;
  units: { symbol: string; symbols: string[]; names: string[] }[];
}

/** Every physical unit, grouped by kind, with all the ways to write it. */
export function unitCatalog(): UnitCatalogKind[] {
  return UNIT_KINDS.map(([kind, d]) => ({
    kind,
    units: UNIT_SPECS.filter((s) => !s.def.currency && !s.def.crypto && sameDim(s.def.dim, d)).map(
      (s) => ({
        symbol: s.def.symbol,
        symbols: s.symbols,
        names: s.names,
      }),
    ),
  }));
}
