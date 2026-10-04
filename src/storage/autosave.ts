/**
 * Debounced saver. `schedule` queues the latest value; `flush` writes it immediately.
 * Only the most recent value is written, and writes never overlap.
 */
export function createAutosave<T>(write: (value: T) => Promise<unknown>, delay = 300) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    running = running.then(async () => {
      if (!pending) return;
      const { value } = pending;
      pending = undefined;
      await write(value);
    });
    return running;
  };

  return {
    schedule(value: T) {
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    get dirty() {
      return pending !== undefined;
    },
  };
}
