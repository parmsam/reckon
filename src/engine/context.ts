export interface Settings {
  /** BCP 47 locale used for number formatting. */
  locale: string;
  /** Maximum number of decimal places shown in results. */
  precision: number;
  angleUnit: 'deg' | 'rad';
  /** Maximum decimal places for results with units (currencies use their own). */
  unitPrecision: number;
  /** Pixels per inch, for CSS units. */
  ppi: number;
  /** Size of 1em, in px. */
  emPx: number;
  /** Units of each currency per 1 USD. Without rates, only same-currency math works. */
  rates?: Readonly<Record<string, number>>;
}

export const defaultSettings: Settings = {
  locale: 'en-US',
  precision: 10,
  angleUnit: 'deg',
  unitPrecision: 4,
  ppi: 96,
  emPx: 16,
};
