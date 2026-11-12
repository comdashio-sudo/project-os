import { projectErrorCode } from "./errorCode";
// Offline queue for the phone entry screen (G-033). A request that could not reach the server is kept on the device
// with the identifier it was first sent with, and is sent again, one at a time and in order, when the phone is back
// online. The server answers a repeated identifier with the stored first answer (client_requests), so a request whose
// reply was lost on the way back is never applied twice.
export type QueueKind = "progress" | "issue" | "team" | "receipt";
export type QueueItem = { id: string; kind: QueueKind; payload: Record<string, unknown>; summary: string; createdAt: string; status: "pending" | "failed"; error?: string; busyAnswers?: number };
export type SendResult = void | { rejected: string };
export type QueueStore = Pick<Storage, "getItem" | "setItem">;

/** The server says the same request is still running (or its outcome is not known). Asked again a few times before it is shown to the person as failed. */
export const IN_PROGRESS_CODE = "PROJECT_OS_CLIENT_REQUEST_IN_PROGRESS";
export const MAX_BUSY_ANSWERS = 5;
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
        // the product's code sits in data.projectError.code (the message is the English sentence); a plain Error thrown by a sender still carries it as its message
        const code = projectErrorCode(error) ?? (error as { message?: string } | null)?.message ?? null;
        if (code === IN_PROGRESS_CODE && (item.busyAnswers ?? 0) + 1 < MAX_BUSY_ANSWERS) {
          // Likely the first attempt is still being processed: keep it pending, count the answer, and stop here so the order is kept.
          saveQueue(scope, loadQueue(scope, store).map(entry => entry.id === id ? { ...entry, busyAnswers: (entry.busyAnswers ?? 0) + 1 } : entry), store);
          outcome.stoppedOffline = true; break;
        }
        saveQueue(scope, loadQueue(scope, store).map(entry => entry.id === id ? { ...entry, status: "failed" as const, error: code ?? "UNKNOWN" } : entry), store);
        outcome.failed += 1;
      }
    }
  } finally { running.delete(scope); }
  return outcome;
}
