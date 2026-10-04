import { fetchCryptoRates, fetchFiatRates, type RatesSnapshot } from '../data/rates';
import { getDB } from '../storage/db';

const BASE = 'USD';
const MAX_AGE = 60 * 60 * 1000;

/**
 * Keeps exchange rates fresh: cached in IndexedDB, refreshed at most hourly while online, and
 * falling back to the snapshot bundled at build time. Crypto prices are only fetched once a
 * note mentions crypto.
 */
export class RatesManager {
  private current?: RatesSnapshot;
  private cryptoFetchedAt = 0;
  private wantCrypto = false;
  private refreshing?: Promise<void>;

  constructor(
    private onChange: (snapshot: RatesSnapshot) => void,
    private fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
  ) {}

  get snapshot(): RatesSnapshot | undefined {
    return this.current;
  }

  async init(): Promise<void> {
    try {
      const cached = await (await getDB()).get('rates', BASE);
      if (cached) {
        this.cryptoFetchedAt = cached.cryptoFetchedAt ?? 0;
        this.wantCrypto = this.cryptoFetchedAt > 0;
        return this.apply({ fetchedAt: cached.fetchedAt, rates: cached.rates }, false);
      }
    } catch {
      // Storage unavailable: use the bundled snapshot.
    }
    const { default: bundled } = await import('../data/rates.snapshot.json');
    this.apply(bundled as RatesSnapshot, false);
  }

  /** Fetches new rates if the current ones are over an hour old (or `force`). Never throws. */
  refresh(force = false): Promise<void> {
    this.refreshing ??= this.doRefresh(force).finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  /** Called when a note mentions crypto. Fetches prices once if they're missing or stale. */
  needCrypto(): void {
    if (this.wantCrypto) return;
    this.wantCrypto = true;
    void this.refresh(true);
  }

  private async doRefresh(force: boolean): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    const fiatStale = force || !this.current || now - this.current.fetchedAt > MAX_AGE;
    const cryptoStale = this.wantCrypto && now - this.cryptoFetchedAt > MAX_AGE;
    if (!fiatStale && !cryptoStale) return;

    const [fiat, crypto] = await Promise.all([
      fiatStale ? fetchFiatRates(this.fetchFn).catch(() => undefined) : undefined,
      cryptoStale ? fetchCryptoRates(this.fetchFn).catch(() => undefined) : undefined,
    ]);
    if (!fiat && !crypto) return;
    if (crypto) this.cryptoFetchedAt = now;
    this.apply(
      {
        fetchedAt: fiat ? now : (this.current?.fetchedAt ?? now),
        rates: { ...this.current?.rates, ...fiat, ...crypto },
      },
      true,
    );
  }

  private apply(snapshot: RatesSnapshot, save: boolean): void {
    this.current = snapshot;
    this.onChange(snapshot);
    if (!save) return;
    void getDB()
      .then((db) =>
        db.put('rates', {
          base: BASE,
          ...snapshot,
          cryptoFetchedAt: this.cryptoFetchedAt || undefined,
        }),
      )
      .catch(() => {});
  }
}
