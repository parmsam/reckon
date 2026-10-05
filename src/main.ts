import './styles.css';
import { startApp } from './app/app';

/** Shortest time the splash stays up, so it doesn't just flash. */
const SPLASH_MIN_MS = 700;

/** Fades out the splash screen (if it's on), once the app is ready. */
function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(
    () => {
      splash.classList.add('done');
      setTimeout(() => splash.remove(), 400);
    },
    Math.max(0, SPLASH_MIN_MS - performance.now()),
  );
}

// Browsers without the Temporal API (needed for dates) get a polyfill, loaded only when missing.
async function main(): Promise<void> {
  try {
    if (!('Temporal' in globalThis)) await import('temporal-polyfill/global');
    await startApp(document.getElementById('root')!);
  } finally {
    hideSplash();
  }
}

void main();
