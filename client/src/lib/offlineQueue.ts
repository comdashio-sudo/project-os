// Offline queue for the phone entry screen (G-033). A request that could not reach the server is kept on the device
// with the identifier it was first sent with, and is sent again, one at a time and in order, when the phone is back
// online. The server answers a repeated identifier with the stored first answer (client_requests), so a request whose
// reply was lost on the way back is never applied twice.
export type QueueKind = "progress" | "issue" | "team" | "receipt";
export type QueueItem = { id: string; kind: QueueKind; payload: Record<string, unknown>; summary: string; createdAt: string; status: "pending" | "failed"; error?: string };
export type SendResult = void | { rejected: string };
export type QueueStore = Pick<Storage, "getItem" | "setItem">;

const DATE_FIELDS = ["reportedAt", "issuedAt", "workDate", "receivedAt"];
const keyFor = (scope: string) => `projectOs.offlineQueue.v1:${scope}`;
const defaultStore = (): QueueStore | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function loadQueue(scope: string, store: QueueStore | null = defaultStore()): QueueItem[] {
  try {
    const parsed = JSON.parse(store?.getItem(keyFor(scope)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is QueueItem => Boolean(item) && typeof item.id === "string" && typeof item.kind === "string") : [];
  } catch { return []; }
}

// Storage can be full or blocked (private mode). Saving then reports false so the screen says so instead of
// pretending the request is safe on the phone.
export function saveQueue(scope: string, items: QueueItem[], store: QueueStore | null = defaultStore()): boolean {
  try { store?.setItem(keyFor(scope), JSON.stringify(items)); return Boolean(store); } catch { return false; }
}

export function enqueue(scope: string, item: Omit<QueueItem, "createdAt" | "status">, store: QueueStore | null = defaultStore()): boolean {
  const items = loadQueue(scope, store);
  if (items.some(existing => existing.id === item.id)) return true; // already kept: same request, same identifier
  return saveQueue(scope, [...items, { ...item, createdAt: new Date().toISOString(), status: "pending" }], store);
}

export const discard = (scope: string, id: string, store: QueueStore | null = defaultStore()) => saveQueue(scope, loadQueue(scope, store).filter(item => item.id !== id), store);
export const retryFailed = (scope: string, id: string, store: QueueStore | null = defaultStore()) => saveQueue(scope, loadQueue(scope, store).map(item => item.id === id ? { ...item, status: "pending" as const, error: undefined } : item), store);

/** The server never answered: no HTTP reply means no tRPC error code. Anything the server said is an answer, not a network fault. */
export function isNetworkError(error: unknown): boolean {
  const data = (error as { data?: { code?: string } | null } | null)?.data;
  if (data?.code === "TIMEOUT") return true;
  if (data?.code) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError || /failed to fetch|network|load failed|fetch/i.test((error as { message?: string } | null)?.message ?? "");
}

export function reviveDates(payload: Record<string, unknown>): Record<string, unknown> {
  const revived = { ...payload };
  for (const field of DATE_FIELDS) if (typeof revived[field] === "string") revived[field] = new Date(revived[field] as string);
  return revived;
}

const running = new Set<string>();

/**
 * Sends the pending items in order. A network fault stops the run and leaves every unsent item pending; an answer from
 * the server that refuses an item marks that item failed (kept, with the reason) and moves on, so one bad item never
 * blocks the ones behind it. Two runs for the same scope never overlap.
 */
export async function flushQueue(scope: string, send: (item: QueueItem) => Promise<SendResult>, store: QueueStore | null = defaultStore()): Promise<{ sent: number; failed: number; stoppedOffline: boolean }> {
  const outcome = { sent: 0, failed: 0, stoppedOffline: false };
  if (running.has(scope)) return outcome;
  running.add(scope);
  try {
    for (const { id } of loadQueue(scope, store).filter(item => item.status === "pending")) {
      const item = loadQueue(scope, store).find(entry => entry.id === id);
      if (!item || item.status !== "pending") continue;
      try {
        const result = await send(item);
        if (result && "rejected" in result) { saveQueue(scope, loadQueue(scope, store).map(entry => entry.id === id ? { ...entry, status: "failed" as const, error: result.rejected } : entry), store); outcome.failed += 1; }
        else { discard(scope, id, store); outcome.sent += 1; }
      } catch (error) {
        if (isNetworkError(error)) { outcome.stoppedOffline = true; break; }
        saveQueue(scope, loadQueue(scope, store).map(entry => entry.id === id ? { ...entry, status: "failed" as const, error: (error as { message?: string })?.message ?? "UNKNOWN" } : entry), store);
        outcome.failed += 1;
      }
    }
  } finally { running.delete(scope); }
  return outcome;
}
