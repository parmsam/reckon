import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Registers the service worker. When a new version has downloaded, `onUpdate` is called with a
 * function that switches to it and reloads the page. Checks for updates hourly while open.
 */
export function watchForUpdates(onUpdate: (apply: () => Promise<void>) => void): void {
  if (!('serviceWorker' in navigator)) return;
  const activate = registerSW({
    onNeedRefresh: () =>
      onUpdate(async () => {
        // Reload once the new version is in control (the plugin's own reload doesn't fire
        // reliably here), with a fallback in case that event never comes.
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
          once: true,
        });
        setTimeout(() => location.reload(), 3000);
        await activate(false);
      }),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      setInterval(() => void registration.update(), CHECK_EVERY_MS);
      // Home-screen apps (iOS especially) resume from the background without reloading, and
      // timers pause there, so also check whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });
}
