import { describe, expect, it, vi } from "vitest";
import {
  CODE_TTL_MS,
  createEmailCodeService,
  EmailCodeError,
  hashEmail,
  MAX_ATTEMPTS,
  MAX_REQUESTS_PER_HOUR,
  MIN_REQUEST_INTERVAL_MS,
  normalizeEmail,
  openIdForEmail,
  type LoginCodeRepository,
  type LoginCodeRow,
  type OutgoingMail,
} from "./emailCode";

const SECRET = "unit-test-secret-0123456789";
const ADDRESS = "Engineer@Example.TEST";

function memoryRepository() {
  const rows: LoginCodeRow[] = [];
  const repository: LoginCodeRepository = {
    async countSince(emailHash, since) { return rows.filter(r => r.emailHash === emailHash && r.createdAt >= since).length; },
    async latestCreatedAt(emailHash) { return rows.filter(r => r.emailHash === emailHash).map(r => r.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null; },
    async retireOpen(emailHash, now) { rows.filter(r => r.emailHash === emailHash && !r.consumedAt).forEach(r => { r.consumedAt = now; }); },
    async insert(row) { rows.push({ ...row, attempts: 0, consumedAt: null }); },
    async findOpen(emailHash, now) { return rows.filter(r => r.emailHash === emailHash && !r.consumedAt && r.expiresAt > now).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null; },
    async addAttempt(id) { const row = rows.find(r => r.id === id); if (row) row.attempts += 1; },
    async consume(id, now) { const row = rows.find(r => r.id === id); if (!row || row.consumedAt) return false; row.consumedAt = now; return true; },
  };
  return { rows, repository };
}

function setup(options: { mailerFails?: boolean; noMailer?: boolean; codes?: string[] } = {}) {
  const { rows, repository } = memoryRepository();
  const sent: OutgoingMail[] = [];
  let clock = new Date("2026-10-15T12:00:00.000Z").getTime();
  const codes = [...(options.codes ?? ["123456", "654321", "111111", "222222", "333333", "444444", "555555"])];
  const mailer = options.noMailer ? null : { send: vi.fn(async (mail: OutgoingMail) => { if (options.mailerFails) throw new Error("provider down"); sent.push(mail); }) };
  const service = createEmailCodeService({ repository, mailer, secret: SECRET, now: () => new Date(clock), randomCode: () => codes.shift() ?? "000000" });
  return { service, rows, sent, mailer, advance: (ms: number) => { clock += ms; } };
}

const failure = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as EmailCodeError; } throw new Error("expected a failure"); };

describe("addresses", () => {
  it("normalizes case and spaces and derives a stable identity", () => {
    expect(normalizeEmail("  Engineer@Example.TEST ")).toBe("engineer@example.test");
    expect(openIdForEmail("engineer@example.test")).toMatch(/^email:[0-9a-f]{40}$/);
    expect(openIdForEmail("engineer@example.test")).toBe(openIdForEmail(normalizeEmail(ADDRESS)));
    expect(openIdForEmail("a@example.test")).not.toBe(openIdForEmail("b@example.test"));
  });

  it("rejects anything that is not one plain address", () => {
    for (const bad of ["", "no-at-sign", "a@b", "a b@example.test", "a@example.test, b@example.test", "<a@example.test>", `${"x".repeat(250)}@example.test`, 42, null, undefined]) {
      expect(() => normalizeEmail(bad), String(bad)).toThrow(EmailCodeError);
    }
  });
});

describe("requesting a code", () => {
  it("mails the code once and stores only hashes", async () => {
    const { service, rows, sent } = setup();
    expect(await service.requestCode(ADDRESS)).toEqual({ expiresInSeconds: CODE_TTL_MS / 1000 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("engineer@example.test");
    expect(sent[0].text).toContain("123456");
    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain("123456");
    expect(stored).not.toContain("engineer");
    expect(rows[0].emailHash).toBe(hashEmail("engineer@example.test"));
  });

  it("refuses an invalid address before touching the database or the mailer", async () => {
    const { service, rows, mailer } = setup();
    expect((await failure(service.requestCode("nope"))).code).toBe("EMAIL_INVALID");
    expect(rows).toHaveLength(0);
    expect(mailer!.send).not.toHaveBeenCalled();
  });

  it("reports an unavailable mailer, and a failing one, without leaving a usable code", async () => {
    expect((await failure(setup({ noMailer: true }).service.requestCode(ADDRESS))).code).toBe("MAIL_UNAVAILABLE");
    const { service, rows } = setup({ mailerFails: true });
    expect((await failure(service.requestCode(ADDRESS))).code).toBe("MAIL_UNAVAILABLE");
    expect(rows[0].consumedAt).not.toBeNull();
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("allows one request per 30 seconds and five per hour per address", async () => {
    const { service, advance } = setup();
    await service.requestCode(ADDRESS);
    advance(MIN_REQUEST_INTERVAL_MS - 1000);
    expect((await failure(service.requestCode(ADDRESS))).code).toBe("RATE_LIMITED");
    for (let i = 1; i < MAX_REQUESTS_PER_HOUR; i++) {
      advance(MIN_REQUEST_INTERVAL_MS + 1000);
      await service.requestCode(ADDRESS);
    }
    advance(MIN_REQUEST_INTERVAL_MS + 1000);
    expect((await failure(service.requestCode(ADDRESS))).code).toBe("RATE_LIMITED");
    advance(60 * 60 * 1000);
    await expect(service.requestCode(ADDRESS)).resolves.toBeTruthy();
  });

  it("counts addresses separately", async () => {
    const { service } = setup();
    await service.requestCode("a@example.test");
    await expect(service.requestCode("b@example.test")).resolves.toBeTruthy();
  });

  it("retires the previous code when a new one is requested", async () => {
    const { service, advance } = setup();
    await service.requestCode(ADDRESS);
    advance(MIN_REQUEST_INTERVAL_MS + 1000);
    await service.requestCode(ADDRESS);
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
    await expect(service.verifyCode(ADDRESS, "654321")).resolves.toEqual({ email: "engineer@example.test" });
  });
});

describe("verifying a code", () => {
  it("accepts the right code once, whatever the case of the address", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    await expect(service.verifyCode("ENGINEER@example.test", " 123456 ")).resolves.toEqual({ email: "engineer@example.test" });
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("refuses a wrong code and the same failure for every other reason", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    const reasons = await Promise.all([
      failure(service.verifyCode(ADDRESS, "000000")),
      failure(service.verifyCode("someone-else@example.test", "123456")),
      failure(service.verifyCode("not an address", "123456")),
      failure(service.verifyCode(ADDRESS, "12345")),
      failure(service.verifyCode(ADDRESS, "12345a")),
      failure(service.verifyCode(ADDRESS, 123456)),
    ]);
    for (const error of reasons) expect(error.code).toBe("CODE_INVALID");
  });

  it("refuses an expired code", async () => {
    const { service, advance } = setup();
    await service.requestCode(ADDRESS);
    advance(CODE_TTL_MS + 1);
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("locks after five wrong guesses, even for the right code afterwards", async () => {
    const { service, rows } = setup();
    await service.requestCode(ADDRESS);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await failure(service.verifyCode(ADDRESS, "999999"));
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS);
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
    expect(rows[0].consumedAt).not.toBeNull();
  });

  it("lets exactly one of two simultaneous correct submissions through", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    const results = await Promise.allSettled([service.verifyCode(ADDRESS, "123456"), service.verifyCode(ADDRESS, "123456")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });

  it("a code is bound to its address", async () => {
    const { service, rows } = setup();
    await service.requestCode("a@example.test");
    // Same hash of the code under another address must not verify.
    const other = createEmailCodeService({ repository: { ...memoryRepository().repository, findOpen: async () => ({ ...rows[0], emailHash: hashEmail("b@example.test") }) }, mailer: null, secret: SECRET, now: () => new Date("2026-10-15T12:00:01.000Z") });
    expect((await failure(other.verifyCode("b@example.test", "123456"))).code).toBe("CODE_INVALID");
  });
});

describe("construction", () => {
  it("refuses a short signing secret", () => {
    expect(() => createEmailCodeService({ repository: memoryRepository().repository, mailer: null, secret: "short" })).toThrow(/JWT_SECRET/);
  });
});
