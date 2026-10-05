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

// Dates need Temporal; use the polyfill only where it's missing (Node, older browsers).
if (!('Temporal' in globalThis)) {
  (globalThis as { Temporal?: unknown }).Temporal = TemporalPolyfill;
}

export { evaluateDocument, formatValue, defaultSettings } from './engine';
export type { LineResult, Settings, Value } from './engine';
export { fetchCryptoRates, fetchFiatRates } from './data/rates';
export { decodeLinkText, noteLink, SITE_URL } from './links';
import { encodeShare } from './app/share';
import { SITE_URL } from './links';

/**
 * A compressed share link (`#/share/<deflate-raw, base64url>`): shorter than noteLink for long
 * notes. Needs CompressionStream (browsers, Node 18+, Deno).
 */
export async function shareLink(text: string, base = SITE_URL): Promise<string> {
  return `${base}#/share/${await encodeShare(text)}`;
}
export { decodeShare } from './app/share';

export const VERSION = '1.0.0';

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
export function evaluate(text: string, options: Partial<Settings> = {}): LineOutput[] {
  const settings: Partial<Settings> = {
    locale: 'en-US',
    now: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rates: bundledRates.rates,
    ...options,
  };
  const inputs = text.split('\n');
  return evaluateDocument(text, settings).map((r, i) => ({
    line: i + 1,
    input: inputs[i]!,
    kind: r.kind,
    ...(r.display !== undefined && { result: r.display }),
    ...(r.error !== undefined && { error: r.error }),
    ...(r.variable !== undefined && { variable: r.variable }),
  }));
}
