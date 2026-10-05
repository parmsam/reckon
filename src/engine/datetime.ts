import type { Settings } from './context';
import { checkZone, type DateSpec } from './dates';
import { getUnit, type UnitContext, type UnitExpr } from './units';
import { compatible, convert } from './units/quantity';
import { CalcError, D, type Decimal, type Value } from './values';

export type DateValue = Extract<Value, { kind: 'datetime' }>;
export interface Duration {
  value: Decimal;
  unit: UnitExpr;
}

const SECONDS: UnitExpr = [{ unit: getUnit('s')!, power: 1 }];
const HOURS: UnitExpr = [{ unit: getUnit('h')!, power: 1 }];
const DAYS: UnitExpr = [{ unit: getUnit('day')!, power: 1 }];
const MS_PER_HOUR = 3_600_000;

/** Units added by the calendar, so a month after Jan 31 is Feb 28, not 30.4 days later. */
const CALENDAR_UNITS: Record<string, ['days' | 'weeks' | 'months' | 'years', number]> = {
  day: ['days', 1],
  week: ['weeks', 1],
  month: ['months', 1],
  year: ['years', 1],
  decade: ['years', 10],
  century: ['years', 100],
};

/** The current moment from the settings. The engine never reads the real clock itself. */
export function clock(s: Settings, zone = s.timeZone): Temporal.ZonedDateTime {
  if (s.now === undefined) throw new CalcError('No clock');
  return Temporal.Instant.fromEpochMilliseconds(s.now).toZonedDateTimeISO(zone);
}

function plainDate(fields: { year: number; month: number; day: number }): Temporal.PlainDate {
  try {
    return Temporal.PlainDate.from(fields, { overflow: 'reject' });
  } catch {
    throw new CalcError('No such date');
  }
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** Turns a date phrase into a moment, using the clock and time zone in the settings. */
export function resolveDate(spec: DateSpec, s: Settings): DateValue {
  const zone = spec.zone ? checkZone(spec.zone) : s.timeZone;
  const now = clock(s, zone);
  const zoned = Boolean(spec.zone);
  const base = spec.base;
  if (base?.kind === 'now') {
    return { kind: 'datetime', value: now, show: spec.timeOnly ? 'time' : 'datetime', zoned };
  }

  const today = now.toPlainDate();
  let time = spec.time;
  let date = today;
  switch (base?.kind) {
    case 'today':
      date = today.add({ days: base.days });
      break;
    case 'weekday': {
      const ahead = (base.weekday - today.dayOfWeek + 7) % 7;
      if (base.which === 'this') date = today.add({ days: ahead });
      else if (base.which === 'next') date = today.add({ days: ahead || 7 });
      else date = today.subtract({ days: (today.dayOfWeek - base.weekday + 7) % 7 || 7 });
      break;
    }
    case 'relative':
      date = today.add({ [base.unit]: base.amount });
      break;
    case 'calendar':
      date = plainDate({ year: base.year ?? today.year, month: base.month, day: base.day });
      break;
    case 'iso': {
      const m = ISO.exec(base.date)!;
      date = plainDate({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
      if (m[4] !== undefined) {
        time ??= { hour: Number(m[4]), minute: Number(m[5]), second: Number(m[6] ?? 0) };
      }
      break;
    }
  }

  if (time && (time.hour > 23 || time.minute > 59 || time.second > 59))
    throw new CalcError('No such time');
  const value = date.toZonedDateTime({
    timeZone: zone,
    plainTime: time ? Temporal.PlainTime.from(time) : undefined,
  });
  const show = base && time ? 'datetime' : base ? 'date' : 'time';
  return { kind: 'datetime', value, show, zoned };
}

/** Adds (sign 1) or subtracts (sign -1) a duration such as 2 weeks or 90 min. */
export function addDuration(d: DateValue, q: Duration, sign: 1 | -1, ctx: UnitContext): DateValue {
  if (!q.unit.length || !compatible(q.unit, SECONDS)) {
    throw new CalcError('Only durations can be added to dates');
  }
  const n = q.value.times(sign);
  const only = q.unit.length === 1 && q.unit[0]!.power === 1 ? q.unit[0]!.unit : undefined;
  const calendar = only && CALENDAR_UNITS[only.id];
  if (calendar && n.times(calendar[1]).isInteger()) {
    const value = d.value.add({ [calendar[0]]: n.times(calendar[1]).toNumber() });
    return { ...d, value };
  }
  const ms = convert(n, q.unit, SECONDS, ctx).times(1000).round().toNumber();
  const value = d.value.add({ milliseconds: ms });
  const show = d.show === 'date' && ms % (24 * MS_PER_HOUR) !== 0 ? 'datetime' : d.show;
  return { ...d, value, show };
}

/** a − b: whole days between dates, or hours (days past 48 h) when times are involved. */
export function difference(a: DateValue, b: DateValue): Duration {
  if (a.show === 'date' && b.show === 'date') {
    const days = b.value.toPlainDate().until(a.value.toPlainDate(), { largestUnit: 'days' }).days;
    return { value: new D(days), unit: DAYS };
  }
  const hours = new D(a.value.epochMilliseconds - b.value.epochMilliseconds).div(MS_PER_HOUR);
  return hours.abs().lt(48) ? { value: hours, unit: HOURS } : { value: hours.div(24), unit: DAYS };
}

/** Whether a duration is in whole calendar units (days and up), so "3 days ago" is a date. */
export function isCalendarDuration(q: Duration): boolean {
  return q.unit.length === 1 && q.unit[0]!.power === 1 && q.unit[0]!.unit.id in CALENDAR_UNITS;
}

export function inZone(d: DateValue, zone: string): DateValue {
  return {
    kind: 'datetime',
    value: d.value.withTimeZone(checkZone(zone)),
    show: d.show === 'date' ? 'datetime' : d.show,
    zoned: true,
  };
}

/** "Thu, Jan 15, 2026", "3:00 PM", "Fri 7:00 AM GMT+9". */
export function formatDateTime(d: DateValue, s: Settings): string {
  const options: Intl.DateTimeFormatOptions = {};
  if (d.show !== 'time') {
    Object.assign(options, { weekday: 'short', month: 'short', day: 'numeric' });
    // The year only shows when it isn't this year.
    if (s.now === undefined || clock(s, d.value.timeZoneId).year !== d.value.year)
      options.year = 'numeric';
  }
  if (d.show !== 'date') {
    Object.assign(options, { hour: 'numeric', minute: '2-digit' });
    if (d.zoned || d.value.timeZoneId !== s.timeZone) options.timeZoneName = 'short';
    // A time on another day than today (in that zone) gets its weekday: 10pm in Tokyo is "Fri 7:00 AM".
    if (d.show === 'time' && s.now !== undefined) {
      if (!clock(s, d.value.timeZoneId).toPlainDate().equals(d.value.toPlainDate()))
        options.weekday = 'short';
    }
  }
  try {
    return d.value.toLocaleString(s.locale, options);
  } catch {
    // Some engines can't format fixed-offset zones (+05:30): format the wall time and add the offset.
    const rest = { ...options };
    delete rest.timeZoneName;
    return `${d.value.toPlainDateTime().toLocaleString(s.locale, rest)} UTC${d.value.offset}`;
  }
}
