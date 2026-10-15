// Fixed-window counter per key, in memory. Enough for a single-instance
// deployment; the per-address limits in emailCode.ts live in the database and
// are what stops an attack that rotates source addresses.
export function createRateLimiter(options: { windowMs: number; max: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    /** Records one hit and returns false when the key is over its limit. */
    hit(key: string): boolean {
      const at = now();
      if (windows.size > 5000) windows.forEach((w, k) => { if (at - w.start >= options.windowMs) windows.delete(k); });
      const current = windows.get(key);
      if (!current || at - current.start >= options.windowMs) {
        windows.set(key, { start: at, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= options.max;
    },
  };
}
