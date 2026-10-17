import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CACHED_READS_ALLOWLIST, MAX_AGE_MS, clearCachedReads, freshReads, installCachedReads, isAllowlisted, readSaved, rememberRead, type CacheStore } from "./cachedReads";

const memory = (): CacheStore & { raw: Map<string, string> } => { const raw = new Map<string, string>(); return { raw, getItem: key => raw.get(key) ?? null, setItem: (key, value) => { raw.set(key, value); }, removeItem: key => { raw.delete(key); } }; };
const keyOf = (path: string[], input?: unknown) => [path, { input, type: "query" }];

describe("allowlist", () => {
  it("names only the shell reads and none of the families that carry money, quantities, documents or pay", () => {
    expect([...CACHED_READS_ALLOWLIST]).toEqual(["auth.me", "tenant.mine"]);
    for (const forbidden of ["projects.list", "projects.getControls", "fieldEntry.context", "profitability", "payroll", "contracts", "invoices", "boq", "tenders", "documents"]) {
      expect(CACHED_READS_ALLOWLIST.some(name => name.startsWith(forbidden)), forbidden).toBe(false);
      expect(isAllowlisted(keyOf(forbidden.split(".")))).toBe(false);
    }
  });
});

describe("rememberRead / freshReads", () => {
  it("keeps an allowlisted answer with its dates intact and refuses anything else", () => {
    const store = memory();
    expect(rememberRead(7, keyOf(["tenant", "mine"]), [{ id: "t1", name: "شركة تجريبية", createdAt: new Date("2026-01-02T00:00:00Z") }], 1000, store)).toBe(true);
    expect(rememberRead(7, keyOf(["projects", "list"], { tenantId: "t1" }), [{ id: "p1", currentBudget: "100" }], 1000, store)).toBe(false);
    const fresh = freshReads(2000, store);
    expect(fresh).toHaveLength(1);
    expect((fresh[0]!.data as Array<{ createdAt: Date }>)[0]!.createdAt).toBeInstanceOf(Date);
    expect(store.raw.get("projectOs.cachedReads.v1")).not.toContain("currentBudget");
  });
  it("does not keep nothing-answers", () => {
    const store = memory();
    expect(rememberRead(7, keyOf(["auth", "me"]), null, 1, store)).toBe(false);
    expect(rememberRead(7, keyOf(["auth", "me"]), undefined, 1, store)).toBe(false);
  });
  it("drops entries older than 24 hours and entries from the future", () => {
    const store = memory();
    rememberRead(7, keyOf(["tenant", "mine"]), [{ id: "t1" }], 1000, store);
    expect(freshReads(1000 + MAX_AGE_MS, store)).toHaveLength(1);
    expect(freshReads(1000 + MAX_AGE_MS + 1, store)).toHaveLength(0);
    expect(freshReads(500, store)).toHaveLength(0);
  });
  it("replaces everything when a different user's answer arrives", () => {
    const store = memory();
    rememberRead(7, keyOf(["tenant", "mine"]), [{ id: "mine" }], 1, store);
    rememberRead(8, keyOf(["auth", "me"]), { id: 8 }, 2, store);
    expect(readSaved(store)!.userId).toBe(8);
    expect(freshReads(3, store).map(entry => JSON.stringify(entry.data))).toEqual([JSON.stringify({ id: 8 })]);
  });
  it("survives blocked storage and corrupt content without throwing", () => {
    const blocked: CacheStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(rememberRead(1, keyOf(["tenant", "mine"]), [1], 1, blocked)).toBe(false);
    expect(freshReads(1, blocked)).toEqual([]);
    expect(() => clearCachedReads(blocked)).not.toThrow();
    const corrupt = memory(); corrupt.setItem("projectOs.cachedReads.v1", "{not json");
    expect(freshReads(1, corrupt)).toEqual([]);
  });
});

describe("installCachedReads", () => {
  it("online: keeps allowlisted answers as they arrive and hydrates nothing", () => {
    const store = memory(); const client = new QueryClient();
    rememberRead(7, keyOf(["tenant", "mine"]), [{ id: "stale" }], Date.now(), store);
    const { hydratedAt, stop } = installCachedReads(client, () => false, store);
    expect(hydratedAt).toBeNull();
    expect(client.getQueryData(keyOf(["tenant", "mine"]))).toBeUndefined(); // the server is asked online, never the old copy
    client.setQueryData(keyOf(["auth", "me"]), { id: 7, name: "مستخدم" });
    client.setQueryData(keyOf(["tenant", "mine"]), [{ id: "fresh" }]);
    client.setQueryData(keyOf(["projects", "list"], { tenantId: "x" }), [{ id: "p", currentBudget: "9" }]);
    const kept = freshReads(Date.now(), store).map(entry => entry.queryKey[0]);
    expect(kept).toEqual(expect.arrayContaining([["auth", "me"], ["tenant", "mine"]]));
    expect(kept).not.toContainEqual(["projects", "list"]);
    stop();
  });
  it("offline: puts the fresh entries into the client and reports the oldest time", () => {
    const store = memory(); const client = new QueryClient();
    rememberRead(7, keyOf(["tenant", "mine"]), [{ id: "t1" }], Date.now() - 5000, store);
    rememberRead(7, keyOf(["auth", "me"]), { id: 7 }, Date.now() - 1000, store);
    const { hydratedAt, stop } = installCachedReads(client, () => true, store);
    expect(client.getQueryData(keyOf(["tenant", "mine"]))).toEqual([{ id: "t1" }]);
    expect(client.getQueryData(keyOf(["auth", "me"]))).toEqual({ id: 7 });
    expect(hydratedAt).not.toBeNull();
    stop();
  });
  it("a sign-out (auth.me answering null) empties the device cache", () => {
    const store = memory(); const client = new QueryClient();
    const { stop } = installCachedReads(client, () => false, store);
    client.setQueryData(keyOf(["auth", "me"]), { id: 7 });
    expect(readSaved(store)).not.toBeNull();
    client.setQueryData(keyOf(["auth", "me"]), null);
    expect(readSaved(store)).toBeNull();
    stop();
  });
});
