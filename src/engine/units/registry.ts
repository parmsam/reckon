import { D, type Decimal } from '../values';
import { dim, type Dim } from './dims';
import type { UnitContext, UnitDef } from './types';

/**
 * Physical units. `names` match case-insensitively and may contain spaces ("fluid ounces");
 * `symbols` match exactly ("mL", "°C").
 */
export interface UnitSpec {
  def: UnitDef;
  names: string[];
  symbols: string[];
}

const PI = D.acos(-1);

const LENGTH = dim({ length: 1 });
const AREA = dim({ length: 2 });
const VOLUME = dim({ length: 3 });
const MASS = dim({ mass: 1 });
const TIME = dim({ time: 1 });
const TEMPERATURE = dim({ temperature: 1 });
const DATA = dim({ data: 1 });
const ANGLE = dim({ angle: 1 });
const SPEED = dim({ length: 1, time: -1 });
const ENERGY = dim({ mass: 1, length: 2, time: -2 });
const POWER = dim({ mass: 1, length: 2, time: -3 });
const PRESSURE = dim({ mass: 1, length: -1, time: -2 });
const FORCE = dim({ mass: 1, length: 1, time: -2 });
const FREQUENCY = dim({ time: -1 });
const DATA_RATE = dim({ data: 1, time: -1 });

type Factor = number | string | Decimal | ((ctx: UnitContext) => Decimal);

function unit(
  id: string,
  dimension: Dim,
  factor: Factor,
  symbols: string,
  names: string,
  extra: Partial<UnitDef> = {},
): UnitSpec {
  const symbolList = symbols.split(' ').filter(Boolean);
  return {
    def: {
      id,
      symbol: symbolList[0] ?? id,
      dim: dimension,
      factor: typeof factor === 'function' ? factor : new D(factor),
      ...extra,
    },
    symbols: symbolList,
    names: names
      .split(',')
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  };
}

const px = (ctx: UnitContext) => new D('0.0254').div(ctx.ppi);
const em = (ctx: UnitContext) => px(ctx).times(ctx.emPx);

export const PHYSICAL_UNITS: UnitSpec[] = [
  // Length (m)
  unit('nm', LENGTH, '1e-9', 'nm', 'nanometer, nanometers, nanometre, nanometres'),
  unit(
    'um',
    LENGTH,
    '1e-6',
    'µm μm um',
    'micrometer, micrometers, micrometre, micrometres, micron, microns',
  ),
  unit('mm', LENGTH, '0.001', 'mm', 'millimeter, millimeters, millimetre, millimetres'),
  unit('cm', LENGTH, '0.01', 'cm', 'centimeter, centimeters, centimetre, centimetres'),
  unit('m', LENGTH, 1, 'm', 'meter, meters, metre, metres'),
  unit('km', LENGTH, 1000, 'km', 'kilometer, kilometers, kilometre, kilometres'),
  unit('in', LENGTH, '0.0254', 'in ″', 'inch, inches'),
  unit('ft', LENGTH, '0.3048', 'ft ′', 'foot, feet'),
  unit('yd', LENGTH, '0.9144', 'yd', 'yard, yards'),
  unit('mi', LENGTH, '1609.344', 'mi', 'mile, miles'),
  unit('nmi', LENGTH, 1852, 'nmi', 'nautical mile, nautical miles'),
  unit('au', LENGTH, '149597870700', 'au AU', 'astronomical unit, astronomical units'),
  unit('ly', LENGTH, '9460730472580800', 'ly', 'light year, light years, lightyear, lightyears'),
  // CSS
  unit('px', LENGTH, px, 'px', 'pixel, pixels'),
  unit('pt', LENGTH, new D('0.0254').div(72), 'pt', ''),
  unit('em', LENGTH, em, 'em', ''),
  unit('rem', LENGTH, em, 'rem', ''),

  // Area (m²)
  unit('mm2', AREA, '1e-6', 'mm² mm2', 'square millimeter, square millimeters, sq mm', {
    expand: { id: 'mm', power: 2 },
  }),
  unit('cm2', AREA, '1e-4', 'cm² cm2', 'square centimeter, square centimeters, sq cm', {
    expand: { id: 'cm', power: 2 },
  }),
  unit(
    'm2',
    AREA,
    1,
    'm² m2 sqm',
    'square meter, square meters, square metre, square metres, sq m',
    { expand: { id: 'm', power: 2 } },
  ),
  unit(
    'km2',
    AREA,
    '1e6',
    'km² km2',
    'square kilometer, square kilometers, square kilometre, square kilometres, sq km',
    { expand: { id: 'km', power: 2 } },
  ),
  unit('in2', AREA, '0.00064516', 'in² in2', 'square inch, square inches, sq in', {
    expand: { id: 'in', power: 2 },
  }),
  unit('ft2', AREA, '0.09290304', 'ft² ft2 sqft', 'square foot, square feet, sq ft', {
    expand: { id: 'ft', power: 2 },
  }),
  unit('yd2', AREA, '0.83612736', 'yd² yd2', 'square yard, square yards, sq yd', {
    expand: { id: 'yd', power: 2 },
  }),
  unit('mi2', AREA, '2589988.110336', 'mi² mi2', 'square mile, square miles, sq mi', {
    expand: { id: 'mi', power: 2 },
  }),
  unit('ha', AREA, '1e4', 'ha', 'hectare, hectares'),
  unit('acre', AREA, '4046.8564224', 'ac', 'acre, acres', { symbol: 'acre', plural: 'acres' }),

  // Volume (m³)
  unit('ml', VOLUME, '1e-6', 'mL ml', 'milliliter, milliliters, millilitre, millilitres'),
  unit('cl', VOLUME, '1e-5', 'cL cl', 'centiliter, centiliters, centilitre, centilitres'),
  unit('dl', VOLUME, '1e-4', 'dL dl', 'deciliter, deciliters, decilitre, decilitres'),
  unit('l', VOLUME, '0.001', 'L l', 'liter, liters, litre, litres'),
  unit(
    'cm3',
    VOLUME,
    '1e-6',
    'cm³ cm3 cc',
    'cubic centimeter, cubic centimeters, cubic centimetre, cubic centimetres',
    { expand: { id: 'cm', power: 3 } },
  ),
  unit('m3', VOLUME, 1, 'm³ m3', 'cubic meter, cubic meters, cubic metre, cubic metres', {
    expand: { id: 'm', power: 3 },
  }),
  unit('in3', VOLUME, '0.000016387064', 'in³ in3', 'cubic inch, cubic inches', {
    expand: { id: 'in', power: 3 },
  }),
  unit('ft3', VOLUME, '0.028316846592', 'ft³ ft3', 'cubic foot, cubic feet', {
    expand: { id: 'ft', power: 3 },
  }),
  unit('gal', VOLUME, '0.003785411784', 'gal', 'gallon, gallons'),
  unit('qt', VOLUME, '0.000946352946', 'qt', 'quart, quarts'),
  unit('pint', VOLUME, '0.000473176473', '', 'pint, pints', { symbol: 'pint', plural: 'pints' }),
  unit('cup', VOLUME, '0.0002365882365', '', 'cup, cups', { symbol: 'cup', plural: 'cups' }),
  unit('floz', VOLUME, '0.0000295735295625', 'floz', 'fl oz, fluid ounce, fluid ounces', {
    symbol: 'fl oz',
  }),
  unit('tbsp', VOLUME, '0.00001478676478125', 'tbsp', 'tablespoon, tablespoons'),
  unit('tsp', VOLUME, '0.00000492892159375', 'tsp', 'teaspoon, teaspoons'),

  // Mass (kg)
  unit('mg', MASS, '1e-6', 'mg', 'milligram, milligrams, milligramme, milligrammes'),
  unit('g', MASS, '0.001', 'g', 'gram, grams, gramme, grammes'),
  unit('kg', MASS, 1, 'kg', 'kilogram, kilograms, kilogramme, kilogrammes, kilo, kilos'),
  unit('t', MASS, 1000, 't', 'tonne, tonnes, metric ton, metric tons'),
  unit('oz', MASS, '0.028349523125', 'oz', 'ounce, ounces'),
  unit('lb', MASS, '0.45359237', 'lb lbs', 'pound, pounds'),
  unit('st', MASS, '6.35029318', 'st', 'stone, stones'),
  unit('ton', MASS, '907.18474', '', 'ton, tons, short ton, short tons', {
    symbol: 'ton',
    plural: 'tons',
  }),

  // Time (s)
  unit('ns', TIME, '1e-9', 'ns', 'nanosecond, nanoseconds'),
  unit('us', TIME, '1e-6', 'µs μs', 'microsecond, microseconds'),
  unit('ms', TIME, '0.001', 'ms', 'millisecond, milliseconds'),
  unit('s', TIME, 1, 's sec secs', 'second, seconds'),
  unit('min', TIME, 60, 'min mins', 'minute, minutes'),
  unit('h', TIME, 3600, 'h hr hrs', 'hour, hours'),
  unit('day', TIME, 86400, 'd', 'day, days', { symbol: 'day', plural: 'days' }),
  unit('week', TIME, 604800, 'wk wks', 'week, weeks', { symbol: 'week', plural: 'weeks' }),
  unit('month', TIME, 2629800, 'mo', 'month, months', { symbol: 'month', plural: 'months' }),
  unit('year', TIME, 31557600, 'yr yrs', 'year, years', { symbol: 'year', plural: 'years' }),
  unit('decade', TIME, 315576000, '', 'decade, decades', { symbol: 'decade', plural: 'decades' }),
  unit('century', TIME, 3155760000, '', 'century, centuries', {
    symbol: 'century',
    plural: 'centuries',
  }),

  // Temperature (K)
  unit('k', TEMPERATURE, 1, 'K', 'kelvin, kelvins'),
  unit('c', TEMPERATURE, 1, '°C C degC', 'celsius, centigrade, degree celsius, degrees celsius', {
    offset: new D('273.15'),
  }),
  unit(
    'f',
    TEMPERATURE,
    new D(5).div(9),
    '°F F degF',
    'fahrenheit, degree fahrenheit, degrees fahrenheit',
    { offset: new D('459.67') },
  ),

  // Data (bytes)
  unit('bit', DATA, '0.125', 'bit bits', 'bit, bits', { symbol: 'bit', plural: 'bits' }),
  unit('B', DATA, 1, 'B', 'byte, bytes'),
  unit('KB', DATA, 1e3, 'KB kB kb', 'kilobyte, kilobytes'),
  unit('MB', DATA, 1e6, 'MB mb', 'megabyte, megabytes'),
  unit('GB', DATA, 1e9, 'GB gb', 'gigabyte, gigabytes'),
  unit('TB', DATA, 1e12, 'TB tb', 'terabyte, terabytes'),
  unit('PB', DATA, 1e15, 'PB pb', 'petabyte, petabytes'),
  // Bits: capital B is bytes, b is bits (kb, mb and gb stay bytes, as people often write them).
  unit('kbit', DATA, 125, 'kbit Kbit Kb', 'kilobit, kilobits'),
  unit('Mbit', DATA, 125e3, 'Mbit Mb', 'megabit, megabits'),
  unit('Gbit', DATA, 125e6, 'Gbit Gb', 'gigabit, gigabits'),
  unit('Tbit', DATA, 125e9, 'Tbit Tb', 'terabit, terabits'),
  unit('KiB', DATA, 1024, 'KiB kib', 'kibibyte, kibibytes'),
  unit('MiB', DATA, 1024 ** 2, 'MiB mib', 'mebibyte, mebibytes'),
  unit('GiB', DATA, 1024 ** 3, 'GiB gib', 'gibibyte, gibibytes'),
  unit('TiB', DATA, 1024 ** 4, 'TiB tib', 'tebibyte, tebibytes'),

  // Data rate (bytes per second)
  unit('bps', DATA_RATE, '0.125', 'bps', 'bit per second, bits per second'),
  unit('kbps', DATA_RATE, 125, 'kbps Kbps', 'kilobit per second, kilobits per second'),
  unit('Mbps', DATA_RATE, 125e3, 'Mbps', 'megabit per second, megabits per second'),
  unit('Gbps', DATA_RATE, 125e6, 'Gbps', 'gigabit per second, gigabits per second'),

  // Angle (rad)
  unit('rad', ANGLE, 1, 'rad', 'radian, radians'),
  unit('deg', ANGLE, PI.div(180), '° deg', 'degree, degrees'),

  // Speed (m/s)
  unit('mph', SPEED, '0.44704', 'mph', 'miles per hour'),
  unit('kph', SPEED, new D(1).div('3.6'), 'kph kmh', 'kilometers per hour, kilometres per hour'),
  unit('knot', SPEED, new D(1852).div(3600), 'kn kt', 'knot, knots'),

  // Energy (J), power (W), pressure (Pa), force (N), frequency (Hz)
  unit('J', ENERGY, 1, 'J', 'joule, joules'),
  unit('kJ', ENERGY, 1000, 'kJ', 'kilojoule, kilojoules'),
  unit('cal', ENERGY, '4.184', 'cal', 'calorie, calories'),
  unit('kcal', ENERGY, 4184, 'kcal Cal', 'kilocalorie, kilocalories'),
  unit('Wh', ENERGY, 3600, 'Wh', 'watt hour, watt hours'),
  unit('kWh', ENERGY, 3.6e6, 'kWh', 'kilowatt hour, kilowatt hours'),
  unit('BTU', ENERGY, '1055.05585262', 'BTU btu', ''),
  unit('W', POWER, 1, 'W', 'watt, watts'),
  unit('kW', POWER, 1000, 'kW', 'kilowatt, kilowatts'),
  unit('MW', POWER, 1e6, 'MW', 'megawatt, megawatts'),
  unit('hp', POWER, '745.69987158227022', 'hp', 'horsepower'),
  unit('Pa', PRESSURE, 1, 'Pa', 'pascal, pascals'),
  unit('kPa', PRESSURE, 1000, 'kPa', 'kilopascal, kilopascals'),
  unit('bar', PRESSURE, 1e5, 'bar', 'bar, bars'),
  unit('psi', PRESSURE, '6894.757293168361', 'psi', ''),
  unit('atm', PRESSURE, 101325, 'atm', 'atmosphere, atmospheres'),
  unit('mmHg', PRESSURE, '133.322387415', 'mmHg', ''),
  unit('N', FORCE, 1, 'N', 'newton, newtons'),
  unit('Hz', FREQUENCY, 1, 'Hz', 'hertz'),
  unit('kHz', FREQUENCY, 1e3, 'kHz', 'kilohertz'),
  unit('MHz', FREQUENCY, 1e6, 'MHz', 'megahertz'),
  unit('GHz', FREQUENCY, 1e9, 'GHz', 'gigahertz'),
];
