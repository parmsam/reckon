import type { Settings } from '../engine';
import { getSetting, setSetting } from '../storage/settings';

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  /** Editor font size in px. */
  fontSize: number;
  /** BCP 47 locale for number and date formatting, or '' for the browser's. */
  locale: string;
  /** Maximum decimal places for plain numbers. */
  precision: number;
  /** Maximum decimal places for numbers with units. */
  unitPrecision: number;
  angleUnit: 'deg' | 'rad';
  /** Pixels per inch and 1em in px, for CSS units. */
  ppi: number;
  emPx: number;
  /** Fetch exchange rates. When off, Reckon makes no network requests and uses saved rates. */
  fetchRates: boolean;
  /** Show the splash screen while Reckon starts. */
  showSplash: boolean;
  /** Show a tip at the bottom of the notes list. */
  showTips: boolean;
  /** Show the total bar under the note. */
  showTotals: boolean;
  /** Show line numbers beside the note. */
  showLineNumbers: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  fontSize: 16,
  locale: '',
  precision: 10,
  unitPrecision: 4,
  angleUnit: 'deg',
  ppi: 96,
  emPx: 16,
  fetchRates: true,
  showSplash: true,
  showTips: true,
  showTotals: true,
  showLineNumbers: false,
};

const KEY = 'preferences';
/** Mirrored in localStorage so index.html can set the theme before anything loads. */
const THEME_KEY = 'reckon.theme';
/** Mirrored in localStorage so index.html can skip the splash before anything loads. */
const SPLASH_KEY = 'reckon.splash';

/** Keeps only known keys with valid values, so stored junk can't break the app. */
export function sanitize(input: unknown): Preferences {
  const p = { ...DEFAULT_PREFERENCES };
  if (typeof input !== 'object' || input === null) return p;
  const raw = input as Record<string, unknown>;
  const int = (key: keyof Preferences, min: number, max: number) => {
    const v = raw[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max)
      (p[key] as number) = v;
  };
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') p.theme = raw.theme;
  if (raw.angleUnit === 'deg' || raw.angleUnit === 'rad') p.angleUnit = raw.angleUnit;
  if (typeof raw.fetchRates === 'boolean') p.fetchRates = raw.fetchRates;
  if (typeof raw.showSplash === 'boolean') p.showSplash = raw.showSplash;
  if (typeof raw.showTips === 'boolean') p.showTips = raw.showTips;
  if (typeof raw.showTotals === 'boolean') p.showTotals = raw.showTotals;
  if (typeof raw.showLineNumbers === 'boolean') p.showLineNumbers = raw.showLineNumbers;
  if (typeof raw.locale === 'string' && (raw.locale === '' || isLocale(raw.locale)))
    p.locale = raw.locale;
  int('fontSize', 12, 24);
  int('precision', 0, 20);
  int('unitPrecision', 0, 20);
  int('ppi', 50, 600);
  int('emPx', 4, 64);
  return p;
}

function isLocale(tag: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    return sanitize(await getSetting(KEY));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(p: Preferences): Promise<void> {
  try {
    localStorage.setItem(THEME_KEY, p.theme);
    localStorage.setItem(SPLASH_KEY, p.showSplash ? 'on' : 'off');
  } catch {
    // Theme will still apply once IndexedDB loads.
  }
  await setSetting(KEY, p);
}

/** The engine settings these preferences imply. */
export function engineSettings(p: Preferences): Partial<Settings> {
  return {
    locale: p.locale || navigator.language,
    precision: p.precision,
    unitPrecision: p.unitPrecision,
    angleUnit: p.angleUnit,
    ppi: p.ppi,
    emPx: p.emPx,
  };
}

let current: Preferences | undefined;
let darkQuery: MediaQueryList | undefined;

/** Created on first use, so this module also loads in Node (unit tests). */
function systemDark(): boolean {
  if (!darkQuery) {
    darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkQuery.addEventListener('change', () => current && syncThemeColor(current));
  }
  return darkQuery.matches;
}

/** The browser and installed-app title bar follow the theme. */
function syncThemeColor(p: Preferences): void {
  const dark = p.theme === 'dark' || (p.theme === 'system' && systemDark());
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = dark ? '#1c1b22' : '#f7f5f0';
}

/** Applies the look: theme, font size and the browser's theme color. */
export function applyAppearance(p: Preferences, root = document.documentElement): void {
  current = p;
  syncThemeColor(p);
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  // The default size is left to the stylesheet, which uses a smaller one on phones.
  if (p.fontSize === DEFAULT_PREFERENCES.fontSize) root.style.removeProperty('--editor-font-size');
  else root.style.setProperty('--editor-font-size', `${p.fontSize}px`);
}
