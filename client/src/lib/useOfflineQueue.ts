import { useCallback, useEffect, useRef, useState } from "react";
import { discard, enqueue, flushQueue, loadQueue, retryFailed, type QueueItem, type SendResult } from "@/lib/offlineQueue";

// The queue belongs to one person on one project on one phone. Online again, it is sent by itself, one request at a time.
// It also tries again every RETRY_MS while something waits and the phone believes it is online: "online" can stay true
// while the server is unreachable, and no event fires when it comes back.
// `scope` names the person as well as the project (null until the signed-in person is known): a phone shared on site must never
// send one person's waiting requests under the next person's sign-in.
// Moved out of FieldEntry (G-033) for Q-24 (P-120): the PMC progress update, the QC receipt and the daily report keep their saves the same way.
export const RETRY_MS = 30_000;
export type KeepOffline = (item: Pick<QueueItem, "id" | "kind" | "payload" | "summary">) => boolean;

export function useOfflineQueue(scope: string | null, send: (item: QueueItem) => Promise<SendResult>) {
  const [items, setItems] = useState<QueueItem[]>(() => (scope ? loadQueue(scope) : []));
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [flushing, setFlushing] = useState(false);
  const refresh = useCallback(() => setItems(scope ? loadQueue(scope) : []), [scope]);
  useEffect(() => { refresh(); }, [refresh]); // a different person on the same phone sees their own queue
  // The sender is read through a ref so that `flush` keeps one identity: a changing client must not re-arm the effects below on every render.
  const sendRef = useRef(send);
  sendRef.current = send;
  const flush = useCallback(async () => { if (!scope) return; setFlushing(true); try { await flushQueue(scope, item => sendRef.current(item)); } finally { setFlushing(false); refresh(); } }, [scope, refresh]);
  useEffect(() => {
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    if (scope && navigator.onLine !== false && loadQueue(scope).some(item => item.status === "pending")) void flush();
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [scope, flush]);
  const waiting = items.some(item => item.status === "pending");
  useEffect(() => {
    if (!waiting || !online) return undefined;
    const timer = setInterval(() => { void flush(); }, RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, online, flush]);
  const keep: KeepOffline = useCallback(item => { if (!scope) return false; const kept = enqueue(scope, item); refresh(); return kept; }, [scope, refresh]);
  return { items, online, flushing, flush, keep, discard: (id: string) => { if (scope) { discard(scope, id); refresh(); } }, retry: (id: string) => { if (scope) { retryFailed(scope, id); refresh(); void flush(); } } };
}

/** A save the server refused villa by villa (cause.issues) is kept as «failed» with those reasons, «CODE:villa CODE:villa», so the screen can name them. */
export function issuesAsRejection(error: unknown): SendResult | null {
  const issues = (error as { data?: { issues?: Array<{ code: string; villa?: string }> } | null; shape?: { data?: { issues?: Array<{ code: string; villa?: string }> } } } | null)?.data?.issues
    ?? (error as { shape?: { data?: { issues?: Array<{ code: string; villa?: string }> } } } | null)?.shape?.data?.issues;
  return issues?.length ? { rejected: issues.map(issue => `${issue.code}${issue.villa ? `:${issue.villa}` : ""}`).join(" ") } : null;
}
