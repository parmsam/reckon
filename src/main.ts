import './styles.css';
import { startApp } from './app/app';

// Browsers without the Temporal API (needed for dates) get a polyfill, loaded only when missing.
async function main(): Promise<void> {
  if (!('Temporal' in globalThis)) await import('temporal-polyfill/global');
  await startApp(document.getElementById('root')!);
}

void main();
