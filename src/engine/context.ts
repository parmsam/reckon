export interface Settings {
  /** BCP 47 locale used for number formatting. */
  locale: string;
  /** Maximum number of decimal places shown in results. */
  precision: number;
  angleUnit: 'deg' | 'rad';
}

export const defaultSettings: Settings = {
  locale: 'en-US',
  precision: 10,
  angleUnit: 'deg',
};
