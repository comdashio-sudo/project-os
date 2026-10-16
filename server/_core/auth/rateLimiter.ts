// Fixed-window counter per key, in memory. Enough for a single-instance
// deployment; the per-address limits in emailCode.ts live in the database and
// are what stops an attack that rotates source addresses. The memory is bounded:
// expired windows are swept once per window, and past `maxKeys` the oldest keys go.
export function createRateLimiter(options: { windowMs: number; max: number; now?: () => number; maxKeys?: number }) {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 20_000;
  const windows = new Map<string, { start: number; count: number }>();
  let swept = now();

  function sweep(at: number) {
    if (at - swept >= options.windowMs) { windows.forEach((w, k) => { if (at - w.start >= options.windowMs) windows.delete(k); }); swept = at; }
    // Map keeps insertion order, so the first keys are the oldest windows.
    while (windows.size >= maxKeys) { const oldest = windows.keys().next().value; if (oldest === undefined) break; windows.delete(oldest); }
  }

  /** Records one hit and says whether it is allowed, how many are left, and when the window ends. */
  function consume(key: string) {
    const at = now();
    sweep(at);
    const current = windows.get(key);
    if (!current || at - current.start >= options.windowMs) {
      windows.set(key, { start: at, count: 1 });
      return { allowed: true, remaining: options.max - 1, retryAfterMs: 0, resetAfterMs: options.windowMs };
    }
    current.count += 1;
    const resetAfterMs = Math.max(0, options.windowMs - (at - current.start));
    const allowed = current.count <= options.max;
    return { allowed, remaining: Math.max(0, options.max - current.count), retryAfterMs: allowed ? 0 : resetAfterMs, resetAfterMs };
  }

  return {
    consume,
    /** Records one hit and returns false when the key is over its limit. */
    hit(key: string): boolean { return consume(key).allowed; },
    get size() { return windows.size; },
  };
}
