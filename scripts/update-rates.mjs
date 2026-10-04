// Refreshes src/data/rates.snapshot.json, the rates bundled for first-run offline use.
// Run with `npm run update-rates`. Exits non-zero (leaving the old file) if the fetch fails.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const { fetchFiatRates, fetchCryptoRates } = await server.ssrLoadModule('/src/data/rates.ts');
  const fiat = await fetchFiatRates();
  const crypto = await fetchCryptoRates().catch((e) => {
    console.warn(`Crypto prices unavailable: ${e.message}`);
    return {};
  });
  const snapshot = { fetchedAt: Date.now(), rates: { ...fiat, ...crypto } };
  writeFileSync('src/data/rates.snapshot.json', JSON.stringify(snapshot) + '\n');
  console.log(`Saved ${Object.keys(snapshot.rates).length} rates`);
} finally {
  await server.close();
}
