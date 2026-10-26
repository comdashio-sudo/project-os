import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-26: production's database lacked migrations 0010/0011 while the deployed code named their columns, and every sign-in was a server error. These tests fake the
// database error a missing column raises (42703) and prove the session store then signs in and finds the session WITHOUT those columns, and still raises any other failure.
const calls = vi.hoisted(() => ({ log: [] as string[], behind: true, otherError: false }));
const missingColumn = () => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error('column "mfa_verified_at" does not exist'), { code: "42703" }) });
vi.mock("../db", () => ({
  getDb: async () => ({
    insert: () => ({ values: async () => { calls.log.push("insert"); if (calls.otherError) throw new Error("disk full"); if (calls.behind) throw missingColumn(); } }),
    execute: async () => { calls.log.push("raw-insert"); return { rowCount: 1 }; },
    delete: () => ({ where: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => { calls.log.push("update"); if (calls.behind) throw missingColumn(); return { rowCount: 1 }; } }) }),
    select: (fields: Record<string, unknown>) => ({ from: () => ({ where: () => ({ limit: async () => {
      calls.log.push(`select:${Object.keys(fields).join("+")}`);
      if (calls.behind && "mfaVerifiedAt" in fields) throw missingColumn();
      return [{ userId: 7, lastSeenAt: null, mfaVerifiedAt: null }];
    } }) }) }),
  }),
}));

import { sessionStore } from "./sessionStore";

beforeEach(() => { calls.log.length = 0; calls.behind = true; calls.otherError = false; });

describe("the session store while the database is behind the code", () => {
  it("signs in: the insert that names the new column fails, the one without it succeeds", async () => {
    const id = await sessionStore.create({ userId: 7, expiresAt: new Date(Date.now() + 1000) });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.log.slice(0, 2)).toEqual(["insert", "raw-insert"]);
  });
  it("finds the session with the older columns only, and reports it unverified (the second step needs migration 0011)", async () => {
    await expect(sessionStore.findLiveSession("sid")).resolves.toEqual({ userId: 7, mfaVerified: false });
    expect(calls.log).toEqual(["select:userId+lastSeenAt+mfaVerifiedAt", "select:userId"]);
    await expect(sessionStore.markMfaVerified("sid")).resolves.toBe(false);
  });
  it("NEGATIVE: any other database failure is still raised — only a missing column/table is tolerated", async () => {
    calls.otherError = true;
    await expect(sessionStore.create({ userId: 7, expiresAt: new Date(Date.now() + 1000) })).rejects.toThrow("disk full");
    expect(calls.log).toEqual(["insert"]);
  });
  it("with the schema in place the current path is used and nothing falls back", async () => {
    calls.behind = false;
    await sessionStore.create({ userId: 7, expiresAt: new Date(Date.now() + 1000) });
    await expect(sessionStore.findLiveSession("sid")).resolves.toMatchObject({ userId: 7 });
    expect(calls.log).not.toContain("raw-insert");
  });
});
