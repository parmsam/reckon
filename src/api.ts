/**
 * Reckon's engine as a standalone ES module, published at https://parmsam.github.io/reckon/engine.js.
 * Works in browsers, Node, Deno and notebooks: no DOM, no network unless you call fetchFiatRates.
 *
 *   import { evaluate, noteLink } from 'https://parmsam.github.io/reckon/engine.js';
 *   evaluate('5 km in miles\n$30 in EUR'); // [{ line: 1, input: '5 km in miles', result: '3.1069 mi', … }, …]
 */
import { Temporal as TemporalPolyfill } from 'temporal-polyfill';
import snapshot from './data/rates.snapshot.json';
import { evaluateDocument, type LineKind, type Settings } from './engine';
import * as exporters from './export';

// Dates need Temporal; use the polyfill only where it's missing (Node, older browsers).
if (!('Temporal' in globalThis)) {
  (globalThis as { Temporal?: unknown }).Temporal = TemporalPolyfill;
}

export { evaluateDocument, formatValue, defaultSettings } from './engine';
export type { LineResult, Settings, Value } from './engine';
export { fetchCryptoRates, fetchFiatRates } from './data/rates';
export { decodeLinkText, noteLink, SITE_URL } from './links';
/** A compressed share link, labelled with the note's name: `…#/share/monthly-budget/<payload>`. */
export { linkName, shareLink } from './app/share';
export { decodeShare } from './app/share';

export const VERSION = __APP_VERSION__;

/** The exchange rates bundled with this build (units per USD), used when you don't pass `rates`. */
export const bundledRates: { fetchedAt: number; rates: Readonly<Record<string, number>> } =
  snapshot;

export interface LineOutput {
  /** 1-based line number. */
  line: number;
  input: string;
  kind: LineKind;
  /** The formatted answer, when the line has one. */
  result?: string;
  /** Why there's no answer, for lines that look like math but don't evaluate. */
  error?: string;
  /** The variable this line assigns. */
  variable?: string;
}

/**
 * Evaluates a note and returns one entry per line. Defaults: locale en-US, the current time, the
 * local time zone, and the bundled exchange rates. Pass any engine setting to override them.
 */
function withDefaults(options: Partial<Settings>): Partial<Settings> {
  return {
    locale: 'en-US',
    now: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rates: bundledRates.rates,
    ...options,
  };
}

export function evaluate(text: string, options: Partial<Settings> = {}): LineOutput[] {
  const inputs = text.split('\n');
  return evaluateDocument(text, withDefaults(options)).map((r, i) => ({
    line: i + 1,
    input: inputs[i]!,
    kind: r.kind,
    ...(r.display !== undefined && { result: r.display }),
    ...(r.error !== undefined && { error: r.error }),
    ...(r.variable !== undefined && { variable: r.variable }),
  }));
}

/** The note with each answer aligned after its line: "5 km in miles  → 3.1069 mi". */
export function toText(text: string, options: Partial<Settings> = {}): string {
  return exporters.toText(text, evaluateDocument(text, withDefaults(options)));
}

/** The note as Markdown: headings, comments as text, and calculations as | Line | Answer | tables. */
export function toMarkdown(text: string, options: Partial<Settings> = {}): string {
  return exporters.toMarkdown(text, evaluateDocument(text, withDefaults(options)));
}

/** The note as a standalone HTML page. */
export function toHtml(text: string, options: Partial<Settings> & { title?: string } = {}): string {
  const { title, ...settings } = options;
  return exporters.toHtml(text, evaluateDocument(text, withDefaults(settings)), title);
}
