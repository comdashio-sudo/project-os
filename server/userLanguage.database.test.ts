import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userLanguagePreferences, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 16, item 4 (G-203) on a real database and through the real router: the interface language kept on the account. Synthetic people only
// (*.example.test). Each "device" is a fresh caller with no state of its own, which is what a second browser or phone is to the server.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("the interface language kept on the account", () => {
  const stamp = randomUUID().slice(0, 8);
  const ids: Record<"a" | "b" | "c", number> = { a: 0, b: 0, c: 0 };
  const emailOf = (name: string) => `lang-${name}-${stamp}@example.test`;
  const signedIn = (name: "a" | "b" | "c") => appRouter.createCaller({ user: { id: ids[name], openId: `lang-${name}-${stamp}`, name, email: emailOf(name), loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
  const signedOut = () => appRouter.createCaller({ user: null } as unknown as TrpcContext);
  const rowOf = async (userId: number) => {
    const db = await getDb();
    return db!.select().from(userLanguagePreferences).where(eq(userLanguagePreferences.userId, userId));
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    for (const name of ["a", "b", "c"] as const) {
      await db.insert(users).values({ openId: `lang-${name}-${stamp}`, name, email: emailOf(name), loginMethod: "test", role: "user" });
      const [row] = await db.select({ id: users.id }).from(users).where(eq(users.openId, `lang-${name}-${stamp}`));
      ids[name] = row.id;
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    // The preference rows go with their user (ON DELETE CASCADE).
    await db.delete(users).where(like(users.email, `%-${stamp}@example.test`));
  });

  it("a choice saved on one device is read back, with the same value, by another device of the same person", async () => {
    const aCaller = signedIn("a");
    await expect(aCaller.languagePreference.set({ language: "en" })).resolves.toEqual({ language: "en" });
    // The second device: a new caller, nothing carried over from the first.
    await expect(aCaller.languagePreference.get()).resolves.toBe("en");
    const rows = await rowOf(ids.a);
    expect(rows).toHaveLength(1);
    expect(rows[0].language).toBe("en");
  });

  it("a second choice replaces the first: still one row for the person", async () => {
    const aCaller = signedIn("a");
    await aCaller.languagePreference.set({ language: "ur" });
    await expect(aCaller.languagePreference.get()).resolves.toBe("ur");
    const rows = await rowOf(ids.a);
    expect(rows.map(row => row.language)).toEqual(["ur"]);
  });

  it("a person who has never chosen reads null, so the device keeps its own value", async () => {
    const cCaller = signedIn("c");
    await expect(cCaller.languagePreference.get()).resolves.toBeNull();
    expect(await rowOf(ids.c)).toHaveLength(0);
  });

  it("a code outside the three languages is refused, and the saved choice does not change", async () => {
    const aCaller = signedIn("a");
    for (const language of ["fr", "ar-SA", "", "EN"]) {
      await expect(aCaller.languagePreference.set({ language: language as "ar" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(aCaller.languagePreference.get()).resolves.toBe("ur");
  });

  it("the database refuses a code outside the three even when the application is bypassed", async () => {
    const db = await getDb();
    const error = await db!.insert(userLanguagePreferences).values({ userId: ids.c, language: "fr" }).then(() => null, (caught: unknown) => caught);
    expect(error).not.toBeNull();
    expect((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code).toBe("23514");
    expect(await rowOf(ids.c)).toHaveLength(0);
  });

  it("another person's row is never returned, and a user id sent by the client is ignored", async () => {
    const aCaller = signedIn("a"); const bCaller = signedIn("b");
    await bCaller.languagePreference.set({ language: "en" });
    // B tries to write A's row by naming it; the procedure has no such input, so the write lands on B's own row (A is the caller, the id comes from the session).
    await expect(aCaller.languagePreference.set({ language: "ar", userId: ids.b } as unknown as { language: "ar" })).resolves.toEqual({ language: "ar" });
    await expect(aCaller.languagePreference.get()).resolves.toBe("ar");
    await expect(bCaller.languagePreference.get()).resolves.toBe("en");
    expect((await rowOf(ids.b)).map(row => row.language)).toEqual(["en"]);
  });

  it("a signed-out caller is refused on both the read and the write, and nothing is written", async () => {
    const outCaller = signedOut();
    const before = (await rowOf(ids.a)).map(row => row.language);
    await expect(outCaller.languagePreference.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(outCaller.languagePreference.set({ language: "en" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await rowOf(ids.a)).map(row => row.language)).toEqual(before);
    expect(await rowOf(ids.c)).toHaveLength(0);
  });
});
