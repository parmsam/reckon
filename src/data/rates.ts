import { CRYPTO } from '../engine/units';

/** Exchange rates as units of each currency per 1 USD. */
export interface RatesSnapshot {
  fetchedAt: number;
  rates: Record<string, number>;
}

type Fetch = (url: string) => Promise<Response>;

const FIAT_SOURCES: {
  url: string;
  parse: (json: unknown) => Record<string, number> | undefined;
}[] = [
  {
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (json) => {
      const j = json as { result?: string; rates?: Record<string, number> };
      return j.result === 'success' ? j.rates : undefined;
    },
  },
  {
    url: 'https://api.frankfurter.dev/v1/latest?base=USD',
    parse: (json) => {
      const j = json as { rates?: Record<string, number> };
      return j.rates && { ...j.rates, USD: 1 };
    },
  },
];

function validRates(
  rates: Record<string, unknown> | undefined,
): Record<string, number> | undefined {
  if (!rates) return undefined;
  const valid = Object.entries(rates).filter(
    (e): e is [string, number] => /^[A-Z]{3,5}$/.test(e[0]) && typeof e[1] === 'number' && e[1] > 0,
  );
  return valid.length ? Object.fromEntries(valid) : undefined;
}

/** Fiat rates from the first source that answers. Throws if none do. */
export async function fetchFiatRates(fetchFn: Fetch = fetch): Promise<Record<string, number>> {
  for (const source of FIAT_SOURCES) {
    try {
      const res = await fetchFn(source.url);
      if (!res.ok) continue;
      const rates = validRates(source.parse(await res.json()));
      if (rates) return rates;
    } catch {
      // Try the next source.
    }
  }
  throw new Error('No exchange rate source is reachable');
}

/** Crypto prices from CoinGecko, converted to units per USD. */
export async function fetchCryptoRates(fetchFn: Fetch = fetch): Promise<Record<string, number>> {
  const ids = Object.values(CRYPTO).map((c) => c.id);
  const res = await fetchFn(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
  );
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const prices = (await res.json()) as Record<string, { usd?: number }>;
  const rates: Record<string, number> = {};
  for (const [code, { id }] of Object.entries(CRYPTO)) {
    const usd = prices[id]?.usd;
    if (typeof usd === 'number' && usd > 0) rates[code] = 1 / usd;
  }
  return rates;
}

/** Matches notes that mention a cryptocurrency, so crypto prices are only fetched when needed. */
export const MENTIONS_CRYPTO = new RegExp(
  `\\b(${[
    ...Object.keys(CRYPTO),
    ...Object.values(CRYPTO).flatMap((c) => c.names.split(',').map((n) => n.trim())),
    'sats?',
    'satoshis?',
  ]
    .filter(Boolean)
    .join('|')})\\b|₿`,
  'i',
);
