/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { discard, enqueue, flushQueue, isNetworkError, loadQueue, retryFailed, reviveDates, saveQueue, type QueueItem, type QueueStore } from "./offlineQueue";

const memory = (): QueueStore & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }; };
const item = (id: string, over: Partial<QueueItem> = {}) => ({ id, kind: "progress" as const, payload: { reportedAt: "2026-10-15T08:00:00.000Z", percentComplete: 30 }, summary: `item ${id}`, ...over });
let store: ReturnType<typeof memory>;
beforeEach(() => { store = memory(); });

describe("offline queue storage", () => {
  it("keeps what was queued, once per identifier, in order", () => {
    expect(enqueue("s", item("a"), store)).toBe(true);
    expect(enqueue("s", item("b"), store)).toBe(true);
    expect(enqueue("s", item("a"), store)).toBe(true); // the same request again is not a second item
    expect(loadQueue("s", store).map(entry => [entry.id, entry.status])).toEqual([["a", "pending"], ["b", "pending"]]);
    expect(loadQueue("other", store)).toEqual([]); // a different project has its own queue
  });
  it("survives corrupt or unavailable storage without throwing, and reports an unsaved queue", () => {
    store.data.set("projectOs.offlineQueue.v1:s", "{not json");
    expect(loadQueue("s", store)).toEqual([]);
    const full: QueueStore = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(saveQueue("s", [], full)).toBe(false);
    expect(enqueue("s", item("a"), full)).toBe(false);
    expect(enqueue("s", item("a"), null)).toBe(false);
  });
  it("revives dates after the round trip through storage", () => {
    expect(reviveDates({ reportedAt: "2026-10-15T08:00:00.000Z", workDate: "2026-10-15T00:00:00.000Z", note: "x" })).toEqual({ reportedAt: new Date("2026-10-15T08:00:00.000Z"), workDate: new Date("2026-10-15T00:00:00.000Z"), note: "x" });
  });
});

describe("telling a network fault from an answer", () => {
  it("treats a missing reply as a fault and any server answer as an answer", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "x", data: { code: "TIMEOUT" } })).toBe(true);
    expect(isNetworkError({ message: "PROJECT_OS_X", data: { code: "FORBIDDEN" } })).toBe(false);
    expect(isNetworkError({ message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(false);
    expect(isNetworkError(new Error("validation failed"))).toBe(false);
  });
});

describe("flushing", () => {
  it("sends in order and empties the queue", async () => {
    enqueue("s", item("a"), store); enqueue("s", item("b"), store);
    const sent: string[] = [];
    const result = await flushQueue("s", async entry => { sent.push(entry.id); }, store);
    expect(sent).toEqual(["a", "b"]);
    expect(result).toEqual({ sent: 2, failed: 0, stoppedOffline: false });
    expect(loadQueue("s", store)).toEqual([]);
  });
  it("stops at the first network fault and keeps that item and the ones behind it pending", async () => {
    enqueue("s", item("a"), store); enqueue("s", item("b"), store); enqueue("s", item("c"), store);
    let calls = 0;
    const result = await flushQueue("s", async entry => { calls += 1; if (entry.id === "b") throw new TypeError("Failed to fetch"); }, store);
    expect(result).toEqual({ sent: 1, failed: 0, stoppedOffline: true });
    expect(calls).toBe(2); // c was not tried
    expect(loadQueue("s", store).map(entry => [entry.id, entry.status])).toEqual([["b", "pending"], ["c", "pending"]]);
  });
  it("marks an item the server refused as failed with the reason, and still sends the ones behind it", async () => {
    enqueue("s", item("a"), store); enqueue("s", item("b"), store); enqueue("s", item("c", { kind: "team" }), store);
    const result = await flushQueue("s", async entry => {
      if (entry.id === "a") throw Object.assign(new Error("PROJECT_OS_FORBIDDEN"), { data: { code: "FORBIDDEN" } });
      if (entry.id === "c") return { rejected: "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED" };
    }, store);
    expect(result).toEqual({ sent: 1, failed: 2, stoppedOffline: false });
    expect(loadQueue("s", store).map(entry => [entry.id, entry.status, entry.error])).toEqual([["a", "failed", "PROJECT_OS_FORBIDDEN"], ["c", "failed", "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED"]]);
  });
  it("does not send failed items again until they are retried, and lets the user discard them", async () => {
    enqueue("s", item("a"), store);
    await flushQueue("s", async () => { throw Object.assign(new Error("PROJECT_OS_FORBIDDEN"), { data: { code: "FORBIDDEN" } }); }, store);
    const send = vi.fn(async () => {});
    await flushQueue("s", send, store);
    expect(send).not.toHaveBeenCalled();
    retryFailed("s", "a", store);
    expect(loadQueue("s", store)[0].status).toBe("pending");
    expect(loadQueue("s", store)[0].error).toBeUndefined();
    await flushQueue("s", send, store);
    expect(send).toHaveBeenCalledTimes(1);
    enqueue("s", item("z"), store); discard("s", "z", store);
    expect(loadQueue("s", store)).toEqual([]);
  });
  it("never runs two flushes for one project at once, so a request cannot be sent twice in parallel", async () => {
    enqueue("s", item("a"), store);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const send = vi.fn(async () => { await gate; });
    const first = flushQueue("s", send, store);
    const second = await flushQueue("s", send, store);
    expect(second).toEqual({ sent: 0, failed: 0, stoppedOffline: false });
    release(); await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
