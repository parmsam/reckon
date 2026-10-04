import type { Token } from './lexer';
import { CalcError } from './values';

/**
 * Date phrases ("next friday at 3pm", "Dec 25", "2026-07-04") are recognised by the resolve pass
 * and stored as a DateSpec. The spec is turned into a real date at evaluation time, using the
 * clock and time zone from the settings, so parsing never depends on when it runs.
 */

export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}

export type DateBase =
  | { kind: 'now' }
  | { kind: 'today'; days: number }
  | { kind: 'weekday'; weekday: number; which: 'next' | 'last' | 'this' }
  | { kind: 'relative'; unit: 'weeks' | 'months' | 'years'; amount: number }
  | { kind: 'calendar'; month: number; day: number; year?: number }
  | { kind: 'iso'; date: string };

export interface DateSpec {
  base?: DateBase;
  time?: TimeOfDay;
  zone?: string;
  /** Show only the time of day ("time in Tokyo"). */
  timeOnly?: boolean;
}

/** What a datetime value shows: the date, the time of day, or both. */
export type DateShow = 'date' | 'time' | 'datetime';

const MONTHS: Record<string, number> = {};
'january february march april may june july august september october november december'
  .split(' ')
  .forEach((m, i) => {
    MONTHS[m] = i + 1;
    if (m !== 'may') MONTHS[m.slice(0, 3)] = i + 1;
  });
MONTHS.sept = 9;

/** Monday is 1, as in Temporal. Abbreviations only count after next/last/this ("sat" is also satoshis). */
const WEEKDAYS: Record<string, number> = {};
const WEEKDAY_ABBREVIATIONS: Record<string, number> = {};
'monday tuesday wednesday thursday friday saturday sunday'.split(' ').forEach((d, i) => {
  WEEKDAYS[d] = i + 1;
  WEEKDAY_ABBREVIATIONS[d.slice(0, 3)] = i + 1;
});
Object.assign(WEEKDAY_ABBREVIATIONS, { tues: 2, thur: 4, thurs: 4 });

const TODAY_WORDS: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
const ORDINALS = new Set(['st', 'nd', 'rd', 'th']);

/** Common abbreviations, matched in uppercase. They map to places so daylight saving is right. */
const ZONE_ABBREVIATIONS: Record<string, string> = {
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  AKST: 'America/Anchorage',
  HST: 'Pacific/Honolulu',
  BRT: 'America/Sao_Paulo',
  BST: 'Europe/London',
  WET: 'Europe/Lisbon',
  CET: 'Europe/Paris',
  CEST: 'Europe/Paris',
  EET: 'Europe/Athens',
  EEST: 'Europe/Athens',
  MSK: 'Europe/Moscow',
  IST: 'Asia/Kolkata',
  PKT: 'Asia/Karachi',
  ICT: 'Asia/Bangkok',
  SGT: 'Asia/Singapore',
  HKT: 'Asia/Hong_Kong',
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',
  AWST: 'Australia/Perth',
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
};

/** Places people say that aren't IANA city names. */
const PLACE_ALIASES: Record<string, string> = {
  'san francisco': 'America/Los_Angeles',
  'silicon valley': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  california: 'America/Los_Angeles',
  boston: 'America/New_York',
  miami: 'America/New_York',
  atlanta: 'America/New_York',
  washington: 'America/New_York',
  nyc: 'America/New_York',
  dallas: 'America/Chicago',
  houston: 'America/Chicago',
  austin: 'America/Chicago',
  texas: 'America/Chicago',
  hawaii: 'Pacific/Honolulu',
  beijing: 'Asia/Shanghai',
  china: 'Asia/Shanghai',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  india: 'Asia/Kolkata',
  japan: 'Asia/Tokyo',
  korea: 'Asia/Seoul',
  'south korea': 'Asia/Seoul',
  'hong kong': 'Asia/Hong_Kong',
  kyiv: 'Europe/Kyiv',
  uk: 'Europe/London',
  england: 'Europe/London',
  britain: 'Europe/London',
  france: 'Europe/Paris',
  germany: 'Europe/Berlin',
  spain: 'Europe/Madrid',
  italy: 'Europe/Rome',
  netherlands: 'Europe/Amsterdam',
  brazil: 'America/Sao_Paulo',
  'são paulo': 'America/Sao_Paulo',
  australia: 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland',
  utc: 'UTC',
  gmt: 'UTC',
};

/** Lowercase place name → IANA zone, from the zones this browser supports. */
const PLACES = new Map<string, string>();
const zones =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
for (const zone of zones) {
  const city = zone.split('/').pop()!.replace(/_/g, ' ').toLowerCase();
  if (!PLACES.has(city)) PLACES.set(city, zone);
}
for (const [place, zone] of Object.entries(PLACE_ALIASES)) PLACES.set(place, zone);
const MAX_PLACE_WORDS = Math.max(...[...PLACES.keys()].map((p) => p.split(' ').length));

const lower = (t: Token | undefined) => (t?.type === 'word' ? t.text.toLowerCase() : undefined);
const isOp = (t: Token | undefined, op: string) => t?.type === 'op' && t.op === op;
const integer = (t: Token | undefined, min: number, max: number) =>
  t?.type === 'number' && t.value!.isInteger() && t.value!.gte(min) && t.value!.lte(max)
    ? t.value!.toNumber()
    : undefined;

/** A UTC offset written as UTC+5, GMT-3 or UTC+5:30, as a Temporal offset string. */
function offsetAt(src: Token[], i: number): { zone: string; length: number } | undefined {
  const sign = src[i + 1];
  if (
    !(lower(src[i]) === 'utc' || lower(src[i]) === 'gmt') ||
    !(isOp(sign, '+') || isOp(sign, '-'))
  ) {
    return undefined;
  }
  const amount = src[i + 2];
  const time = amount?.type === 'time' ? amount.time : undefined;
  const hours = time ? time.hour : integer(amount, 0, 14);
  if (hours === undefined) return undefined;
  const minutes = time?.minute ?? 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { zone: `${sign!.op}${pad(hours)}:${pad(minutes)}`, length: 3 };
}

/**
 * A time zone written after a time ("3pm PST", "noon UTC+2"): abbreviations and offsets only,
 * since place names could be ordinary words.
 */
export function zoneSuffixAt(
  src: Token[],
  i: number,
): { zone: string; length: number } | undefined {
  const offset = offsetAt(src, i);
  if (offset) return offset;
  const t = src[i];
  if (t?.type !== 'word') return undefined;
  const abbreviation = ZONE_ABBREVIATIONS[t.text];
  if (abbreviation) return { zone: abbreviation, length: 1 };
  if (lower(t) === 'utc' || lower(t) === 'gmt') return { zone: 'UTC', length: 1 };
  return undefined;
}

/** A time zone as a conversion target: "in Tokyo", "to New York", "in PST", "in UTC+9". */
export function zoneAt(src: Token[], i: number): { zone: string; length: number } | undefined {
  const suffix = zoneSuffixAt(src, i);
  if (suffix) return suffix;
  for (let length = Math.min(MAX_PLACE_WORDS, src.length - i); length >= 1; length--) {
    const words = src.slice(i, i + length);
    if (!words.every((t) => t.type === 'word')) continue;
    const zone = PLACES.get(words.map((t) => t.text.toLowerCase()).join(' '));
    if (zone) return { zone, length };
  }
  return undefined;
}

/** "3pm", "15:30", "noon", "midnight". */
function timeAt(src: Token[], i: number): { time: TimeOfDay; length: number } | undefined {
  const t = src[i];
  if (t?.type === 'time') return { time: t.time!, length: 1 };
  const w = lower(t);
  if (w === 'noon' || w === 'midday')
    return { time: { hour: 12, minute: 0, second: 0 }, length: 1 };
  if (w === 'midnight') return { time: { hour: 0, minute: 0, second: 0 }, length: 1 };
  return undefined;
}

/** A 4-digit year after a date, optionally after a comma: "Dec 25, 2026". */
function yearAt(src: Token[], i: number): { year: number; length: number } | undefined {
  const comma = isOp(src[i], ',') ? 1 : 0;
  const year = integer(src[i + comma], 1000, 9999);
  return year === undefined ? undefined : { year, length: comma + 1 };
}

/** Skips an ordinal suffix after a day number: the "th" in "25th". */
const ordinal = (src: Token[], i: number) => (ORDINALS.has(lower(src[i]) ?? '') ? 1 : 0);

function dateBaseAt(src: Token[], i: number): { base: DateBase; length: number } | undefined {
  const t = src[i];
  const w = lower(t);

  if (t?.type === 'date') return { base: { kind: 'iso', date: t.text }, length: 1 };
  if (w === 'now') return { base: { kind: 'now' }, length: 1 };
  if (w !== undefined && w in TODAY_WORDS)
    return { base: { kind: 'today', days: TODAY_WORDS[w]! }, length: 1 };
  if (w !== undefined && w in WEEKDAYS) {
    return { base: { kind: 'weekday', weekday: WEEKDAYS[w]!, which: 'this' }, length: 1 };
  }

  // next friday, last monday, this sat, next week/month/year
  if (w === 'next' || w === 'last' || w === 'this') {
    const n = lower(src[i + 1]) ?? '';
    const weekday = WEEKDAYS[n] ?? WEEKDAY_ABBREVIATIONS[n];
    if (weekday) return { base: { kind: 'weekday', weekday, which: w }, length: 2 };
    const unit = ({ week: 'weeks', month: 'months', year: 'years' } as const)[n as 'week'];
    if (unit && w !== 'this') {
      return { base: { kind: 'relative', unit, amount: w === 'next' ? 1 : -1 }, length: 2 };
    }
    return undefined;
  }

  // Dec 25, December 25th, 2027
  const month = w === undefined ? undefined : MONTHS[w];
  if (month) {
    const day = integer(src[i + 1], 1, 31);
    if (day === undefined) return undefined;
    let length = 2 + ordinal(src, i + 2);
    const year = yearAt(src, i + length);
    if (year) length += year.length;
    return { base: { kind: 'calendar', month, day, year: year?.year }, length };
  }

  // 25 Dec, 3rd of March 2026
  const day = integer(t, 1, 31);
  if (day !== undefined) {
    let length = 1 + ordinal(src, i + 1);
    if (lower(src[i + length]) === 'of') length += 1;
    const monthAfter = MONTHS[lower(src[i + length]) ?? ''];
    if (!monthAfter) return undefined;
    length += 1;
    const year = yearAt(src, i + length);
    if (year) length += year.length;
    return { base: { kind: 'calendar', month: monthAfter, day, year: year?.year }, length };
  }
  return undefined;
}

/**
 * The longest date phrase starting at src[i]: a date, a time, or both, plus an optional zone.
 * "tomorrow at 9am", "3pm tomorrow", "Dec 25 3pm PST", "noon".
 */
export function dateAt(src: Token[], i: number): { spec: DateSpec; length: number } | undefined {
  const spec: DateSpec = {};
  let length: number;

  const base = dateBaseAt(src, i);
  if (base) {
    spec.base = base.base;
    length = base.length;
    if (base.base.kind !== 'now') {
      const at = lower(src[i + length]) === 'at' || isOp(src[i + length], ',') ? 1 : 0;
      const time = timeAt(src, i + length + at);
      if (time) {
        spec.time = time.time;
        length += at + time.length;
      }
    }
  } else {
    const time = timeAt(src, i);
    if (!time) return undefined;
    spec.time = time.time;
    length = time.length;
    const after = dateBaseAt(src, i + length);
    if (after && after.base.kind !== 'now') {
      spec.base = after.base;
      length += after.length;
    }
  }

  const zone = zoneSuffixAt(src, i + length);
  if (zone) {
    spec.zone = zone.zone;
    length += zone.length;
  }
  return { spec, length };
}

/** Checks a time zone is usable, so a bad zone fails as a normal "no result". */
export function checkZone(zone: string): string {
  try {
    Temporal.Now.zonedDateTimeISO(zone);
    return zone;
  } catch {
    throw new CalcError(`Unknown time zone ${zone}`);
  }
}
