/**
 * Lets callers that ask for the SAME thing at the SAME time share one run of it.
 *
 * The executive screen asks for five slices of one dashboard in a single batch; each slice used to recompute the whole dashboard, so
 * the heavy aggregation ran five times for one page load. A run is shared only WHILE it is in flight: the moment it settles the entry is
 * gone, so nothing is ever served from a cache and a later call always reads fresh data. Share only work that a caller would otherwise
 * repeat identically and whose key already includes everything that decides the answer (here: the person and the company).
 */
export function createInFlight<T>() {
  const running = new Map<string, Promise<T>>();
  return {
    run(key: string, work: () => Promise<T>): Promise<T> {
      const existing = running.get(key);
      if (existing) return existing;
      const started = work().finally(() => { if (running.get(key) === started) running.delete(key); });
      running.set(key, started);
      return started;
    },
    pending: () => running.size,
  };
}
