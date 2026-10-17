// Read-only offline cache for a deliberately tiny allowlist of reads (G-100). When the device is offline at start-up the shell can still
// say who is signed in and which companies they belong to, with an honest notice that this is the last copy kept on this device.
//
// Rules this file enforces (each tested):
//  - ONLY the allowlisted procedures are ever written; anything with money, quantities, documents or people's pay is not on it and
//    cannot be added without changing the allowlist test that names the forbidden families.
//  - Entries belong to the one signed-in user; a different user, a sign-out, or an entry older than 24 h drops them all.
//  - Hydration happens only while the browser reports offline. Online, the server is always asked and its answer wins.
//  - Storage that is full or blocked is a silent no-op: the cache is a convenience, never state.
import type { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export const CACHED_READS_ALLOWLIST = ["auth.me", "tenant.mine"] as const;
const STORAGE_KEY = "projectOs.cachedReads.v1";
export const MAX_AGE_MS = 24 * 3_600_000;
export type CacheStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Entry = { key: string; data: string; at: number };
type Saved = { userId: number; entries: Entry[] };

const defaultStore = (): CacheStore | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
export const procedureOf = (queryKey: readonly unknown[]): string => Array.isArray(queryKey[0]) ? (queryKey[0] as unknown[]).join(".") : "";
export const isAllowlisted = (queryKey: readonly unknown[]) => (CACHED_READS_ALLOWLIST as readonly string[]).includes(procedureOf(queryKey));

export function readSaved(store: CacheStore | null = defaultStore()): Saved | null {
  try {
    const parsed = JSON.parse(store?.getItem(STORAGE_KEY) ?? "null");
    return parsed && typeof parsed.userId === "number" && Array.isArray(parsed.entries) ? parsed : null;
  } catch { return null; }
}

export const clearCachedReads = (store: CacheStore | null = defaultStore()) => { try { store?.removeItem(STORAGE_KEY); } catch { /* blocked storage: nothing to clear */ } };

/** Keeps one allowlisted answer for the user it was read for; an answer for another user replaces the whole cache. Returns false when it kept nothing. */
export function rememberRead(userId: number, queryKey: readonly unknown[], data: unknown, now = Date.now(), store: CacheStore | null = defaultStore()): boolean {
  if (!isAllowlisted(queryKey) || data === undefined || data === null) return false;
  try {
    const saved = readSaved(store);
    const keep = saved && saved.userId === userId ? saved.entries.filter(entry => entry.key !== JSON.stringify(queryKey)) : [];
    store?.setItem(STORAGE_KEY, JSON.stringify({ userId, entries: [...keep, { key: JSON.stringify(queryKey), data: superjson.stringify(data), at: now }].slice(-20) } satisfies Saved));
    return Boolean(store);
  } catch { return false; }
}

/** The entries still fresh enough to show offline. */
export function freshReads(now = Date.now(), store: CacheStore | null = defaultStore()): Array<{ queryKey: unknown[]; data: unknown; at: number }> {
  const saved = readSaved(store);
  if (!saved) return [];
  const result: Array<{ queryKey: unknown[]; data: unknown; at: number }> = [];
  for (const entry of saved.entries) {
    if (now - entry.at > MAX_AGE_MS || now < entry.at) continue;
    try { const queryKey = JSON.parse(entry.key); if (isAllowlisted(queryKey)) result.push({ queryKey, data: superjson.parse(entry.data), at: entry.at }); } catch { /* an unreadable entry is dropped, not shown */ }
  }
  return result;
}

/**
 * Wires the cache to the query client: successful allowlisted reads are kept for the signed-in user, a sign-out clears everything, and when the page
 * starts offline the still-fresh entries are put into the client so the shell renders. Returns the time of the oldest hydrated entry (null when nothing was).
 */
export function installCachedReads(queryClient: QueryClient, isOffline: () => boolean = () => typeof navigator !== "undefined" && navigator.onLine === false, store: CacheStore | null = defaultStore()): { hydratedAt: number | null; stop: () => void } {
  let hydratedAt: number | null = null;
  if (isOffline()) {
    for (const entry of freshReads(Date.now(), store)) { queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.at }); hydratedAt = hydratedAt === null ? entry.at : Math.min(hydratedAt, entry.at); }
  }
  const currentUserId = (): number | null => {
    const me = queryClient.getQueryCache().findAll().find(query => procedureOf(query.queryKey) === "auth.me")?.state.data as { id?: number } | null | undefined;
    return typeof me?.id === "number" ? me.id : null;
  };
  const stop = queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const key = event.query.queryKey;
    if (!isAllowlisted(key)) return;
    if (procedureOf(key) === "auth.me") {
      const me = event.query.state.data as { id?: number } | null | undefined;
      if (!me || typeof me.id !== "number") { clearCachedReads(store); return; } // signed out: the device keeps nothing
      rememberRead(me.id, key, me, Date.now(), store);
      return;
    }
    const userId = currentUserId();
    if (userId !== null) rememberRead(userId, key, event.query.state.data, Date.now(), store);
  });
  return { hydratedAt, stop };
}
