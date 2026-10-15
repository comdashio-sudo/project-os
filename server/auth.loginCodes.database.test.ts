import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginCodes } from "../drizzle/schema";
import { createDbLoginCodeRepository } from "./_core/auth/loginCodeRepository";
import { createEmailCodeService, hashEmail } from "./_core/auth/emailCode";
import { getDb } from "./db";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Live proof of the login-code repository against the test database. Skips
// without TEST_DATABASE_URL; run through scripts/run-integration-database-test.mjs.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("login code repository (live)", () => {
  const repository = createDbLoginCodeRepository();
  const emailHash = hashEmail(`live-${randomUUID()}@example.test`);
  const row = (offsetMs = 0, extra: Partial<{ expiresAt: Date }> = {}) => ({
    id: randomUUID(), emailHash, codeHash: "a".repeat(64), createdAt: new Date(Date.now() + offsetMs), expiresAt: extra.expiresAt ?? new Date(Date.now() + 600_000),
  });

  beforeAll(async () => { expect(await getDb()).toBeTruthy(); });
  afterAll(async () => { const db = await getDb(); await db?.delete(loginCodes).where(eq(loginCodes.emailHash, emailHash)); });

  it("stores, counts and finds the newest open code", async () => {
    const first = row(-5000), second = row(0);
    await repository.insert(first);
    await repository.insert(second);
    expect(await repository.countSince(emailHash, new Date(Date.now() - 3_600_000))).toBe(2);
    expect((await repository.findOpen(emailHash, new Date()))?.id).toBe(second.id);
    expect(await repository.latestCreatedAt(emailHash)).toBeInstanceOf(Date);
  });

  it("counts attempts and consumes a code exactly once, even for simultaneous callers", async () => {
    // The service only ever keeps one open code per address (a request retires the previous one).
    await repository.retireOpen(emailHash, new Date());
    const target = row(10);
    await repository.insert(target);
    await repository.addAttempt(target.id);
    await repository.addAttempt(target.id);
    expect((await repository.findOpen(emailHash, new Date()))?.attempts).toBe(2);
    const results = await Promise.all([repository.consume(target.id, new Date()), repository.consume(target.id, new Date()), repository.consume(target.id, new Date())]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.consume(target.id, new Date())).toBe(false);
  });

  it("retires every open code and never returns an expired one", async () => {
    await repository.insert(row(20));
    await repository.retireOpen(emailHash, new Date());
    expect(await repository.findOpen(emailHash, new Date())).toBeNull();
    const expired = row(30, { expiresAt: new Date(Date.now() - 1000) });
    await repository.insert(expired);
    expect(await repository.findOpen(emailHash, new Date())).toBeNull();
  });

  it("runs the whole service against the real table", async () => {
    const sent: string[] = [];
    const address = `live-${randomUUID()}@example.test`;
    const service = createEmailCodeService({ repository, secret: "live-test-secret-0123456789", mailer: { send: async mail => { sent.push(mail.text.match(/\d{6}/)![0]); } } });
    await service.requestCode(address);
    expect((await service.verifyCode(address, "000000").catch(e => e.code))).toBe("CODE_INVALID");
    await expect(service.verifyCode(address, sent[0])).resolves.toEqual({ email: address });
    expect((await service.verifyCode(address, sent[0]).catch(e => e.code))).toBe("CODE_INVALID");
    const db = await getDb(); await db?.delete(loginCodes).where(eq(loginCodes.emailHash, hashEmail(address)));
  });
});
