export type Debouncer<T> = {
  schedule: (value: T) => void;
  flush: () => T | undefined;
  cancel: () => void;
};

export function createDebouncer<T>(
  delayMs: number,
  fn: (value: T) => void,
): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const cancelTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(value: T) {
      pending = { value };
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        const next = pending;
        pending = null;
        if (next) fn(next.value);
      }, delayMs);
    },
    flush() {
      const next = pending;
      cancelTimer();
      pending = null;
      if (!next) return undefined;
      fn(next.value);
      return next.value;
    },
    cancel() {
      cancelTimer();
      pending = null;
    },
  };
}
