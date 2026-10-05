import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RatesManager } from '../src/app/rates';
import { fetchCryptoRates, fetchFiatRates, MENTIONS_CRYPTO } from '../src/data/rates';
import { closeDB, DB_NAME, getDB } from '../src/storage/db';

/** A fake fetch that answers by URL substring. */
function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key === undefined ? undefined : routes[key];
    if (body === undefined) return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

const ER_API = { 'open.er-api.com': { result: 'success', rates: { USD: 1, EUR: 0.9, GBP: 0.8 } } };
const COINGECKO = { coingecko: { bitcoin: { usd: 100000 }, ethereum: { usd: 2000 } } };

afterEach(async () => {
  await closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
  });
});

describe('fetching rates', () => {
  it('reads fiat rates from the primary source', async () => {
    expect(await fetchFiatRates(fakeFetch(ER_API))).toEqual({ USD: 1, EUR: 0.9, GBP: 0.8 });
  });

  it('falls back to Frankfurter when the primary source fails', async () => {
    const fetchFn = fakeFetch({ frankfurter: { base: 'USD', rates: { EUR: 0.91 } } });
    expect(await fetchFiatRates(fetchFn)).toEqual({ EUR: 0.91, USD: 1 });
  });

  it('throws when every source fails, and ignores junk values', async () => {
    await expect(fetchFiatRates(fakeFetch({}))).rejects.toThrow('No exchange rate source');
    const junk = { 'open.er-api.com': { result: 'success', rates: { EUR: -1, bad: 2, GBP: 'x' } } };
    await expect(fetchFiatRates(fakeFetch(junk))).rejects.toThrow();
  });

  it('converts crypto prices to units per dollar', async () => {
    const rates = await fetchCryptoRates(fakeFetch(COINGECKO));
    expect(rates.BTC).toBeCloseTo(0.00001);
    expect(rates.ETH).toBeCloseTo(0.0005);
  });

  it('spots notes that mention crypto', () => {
    expect(MENTIONS_CRYPTO.test('0.5 BTC in USD')).toBe(true);
    expect(MENTIONS_CRYPTO.test('100k sats')).toBe(true);
    expect(MENTIONS_CRYPTO.test('2 ether')).toBe(true);
    expect(MENTIONS_CRYPTO.test('$30 in EUR\nsolar panels')).toBe(false);
  });
});

describe('RatesManager', () => {
  it('starts from the bundled snapshot, then refreshes and caches', async () => {
    const onChange = vi.fn();
    const manager = new RatesManager(onChange, fakeFetch(ER_API));
    await manager.init();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(Object.keys(manager.snapshot!.rates).length).toBeGreaterThan(100);

    await manager.refresh(true);
    expect(manager.snapshot!.rates.EUR).toBe(0.9);
    await vi.waitFor(async () =>
      expect((await (await getDB()).get('rates', 'USD'))?.rates.EUR).toBe(0.9),
    );

    // A second manager starts from the cache and doesn't refetch fresh rates.
    const fetchFn = fakeFetch(ER_API);
    const next = new RatesManager(() => {}, fetchFn);
    await next.init();
    await next.refresh();
    expect(next.snapshot!.rates.EUR).toBe(0.9);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches crypto only when asked, and keeps old rates when sources fail', async () => {
    const fetchFn = fakeFetch({ ...ER_API, ...COINGECKO });
    const manager = new RatesManager(() => {}, fetchFn);
    await manager.init();
    await manager.refresh(true);
    expect(fetchFn.mock.calls.some(([url]) => url.includes('coingecko'))).toBe(false);

    manager.needCrypto();
    await vi.waitFor(() => expect(manager.snapshot!.rates.BTC).toBeCloseTo(0.00001));
    expect(manager.snapshot!.rates.EUR).toBe(0.9);

    const failing = new RatesManager(() => {}, fakeFetch({}));
    await failing.init();
    const before = failing.snapshot;
    await failing.refresh(true);
    expect(failing.snapshot).toBe(before);
  });

  it('makes no requests when rate fetching is turned off', async () => {
    const fetchFn = fakeFetch({ ...ER_API, ...COINGECKO });
    const manager = new RatesManager(() => {}, fetchFn);
    manager.enabled = false;
    await manager.init();
    await manager.refresh(true);
    manager.needCrypto();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(Object.keys(manager.snapshot!.rates).length).toBeGreaterThan(100);
  });
});
