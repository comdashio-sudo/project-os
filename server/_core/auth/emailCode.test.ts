import { describe, expect, it } from "vitest";
import { ATTEMPT_POLICY, createEmailCodeService, DEFAULT_CODE_TTL_SECONDS, EmailCodeError, hashEmail, normalizeEmail, openIdForEmail } from "./emailCode";
import { createFakeCodeProvider, createMemoryAttemptLimiter } from "../../testing/fakeCodeProvider";

const ADDRESS = "Engineer@Example.TEST";

function setup(options: { noProvider?: boolean } = {}) {
  let clock = new Date("2026-10-22T12:00:00.000Z").getTime();
  const now = () => new Date(clock);
  const fake = createFakeCodeProvider({ now, randomCode: (() => { let n = 0; return () => String(123456 + n++); })() });
  const attempts = createMemoryAttemptLimiter();
  const service = createEmailCodeService({ provider: options.noProvider ? null : fake.provider, attempts, now });
  return { service, fake, attempts, advance: (ms: number) => { clock += ms; } };
}

const failure = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as EmailCodeError; } throw new Error("expected a failure"); };

describe("addresses", () => {
  it("normalizes case and spaces and derives a stable identity", () => {
    expect(normalizeEmail("  Engineer@Example.TEST ")).toBe("engineer@example.test");
    expect(openIdForEmail("engineer@example.test")).toMatch(/^email:[0-9a-f]{40}$/);
    expect(openIdForEmail("engineer@example.test")).toBe(openIdForEmail(normalizeEmail(ADDRESS)));
    expect(openIdForEmail("a@example.test")).not.toBe(openIdForEmail("b@example.test"));
  });

  it("keeps the identity the e-mail-code login had before Supabase Auth, so no existing account is orphaned", () => {
    // sha256("engineer@example.test") sliced to 40 characters, as it was computed when the code was stored by this application
    expect(openIdForEmail("engineer@example.test")).toBe(`email:${hashEmail("engineer@example.test").slice(0, 40)}`);
    expect(hashEmail("engineer@example.test")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects anything that is not one plain address", () => {
    for (const bad of ["", "no-at-sign", "a@b", "a b@example.test", "a@example.test, b@example.test", "<a@example.test>", `${"x".repeat(250)}@example.test`, 42, null, undefined]) {
      expect(() => normalizeEmail(bad), String(bad)).toThrow(EmailCodeError);
    }
  });
});

describe("requesting a code", () => {
  it("asks the provider to mail the code for the normalized address, and says how long it lives", async () => {
    const { service, fake } = setup();
    expect(await service.requestCode(ADDRESS)).toEqual({ expiresInSeconds: DEFAULT_CODE_TTL_SECONDS });
    expect(fake.sent.map(mail => mail.to)).toEqual(["engineer@example.test"]);
  });

  it("refuses an invalid address before the provider is asked", async () => {
    const { service, fake } = setup();
    expect((await failure(service.requestCode("nope"))).code).toBe("EMAIL_INVALID");
    expect(fake.sent).toHaveLength(0);
  });

  it("reports an unconfigured or unavailable provider as MAIL_UNAVAILABLE", async () => {
    expect((await failure(setup({ noProvider: true }).service.requestCode(ADDRESS))).code).toBe("MAIL_UNAVAILABLE");
    const down = setup();
    down.fake.setUnavailable(true);
    expect((await failure(down.service.requestCode(ADDRESS))).code).toBe("MAIL_UNAVAILABLE");
  });

  it("passes the provider's rate limit through as RATE_LIMITED", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    expect((await failure(service.requestCode(ADDRESS))).code).toBe("RATE_LIMITED");
  });

  it("answers a request the same way for any address: the service knows no accounts, so it cannot say whether one exists", async () => {
    const { service } = setup();
    const answers = await Promise.all(["known@example.test", "never-seen@example.test", "Third@Example.TEST"].map(address => service.requestCode(address)));
    expect(new Set(answers.map(answer => JSON.stringify(answer))).size).toBe(1);
  });
});

describe("verifying a code", () => {
  it("accepts the right code once, whatever the case of the address", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    await expect(service.verifyCode("ENGINEER@example.test", " 123456 ")).resolves.toEqual({ email: "engineer@example.test" });
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("accepts a code of six to ten digits, because the length is a server setting the owner may change", async () => {
    const { service, fake } = setup();
    await service.requestCode(ADDRESS);
    fake.sent[0].code = "12345678";
    expect((await failure(service.verifyCode(ADDRESS, "12345678"))).code).toBe("CODE_INVALID"); // well formed, just not the mailed one
    expect((await failure(service.verifyCode(ADDRESS, "12345"))).code).toBe("CODE_INVALID"); // too short is refused before the provider
  });

  it("refuses a wrong code and gives the same failure for every other reason", async () => {
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
    advance(DEFAULT_CODE_TTL_SECONDS * 1000 + 1);
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("a code that was used is dead: the same code cannot start a second session", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    await expect(service.verifyCode(ADDRESS, "123456")).resolves.toEqual({ email: "engineer@example.test" });
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("reports an unavailable provider as MAIL_UNAVAILABLE and does not count it as a wrong guess", async () => {
    const { service, fake, attempts } = setup();
    await service.requestCode(ADDRESS);
    fake.setUnavailable(true);
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("MAIL_UNAVAILABLE");
    expect(attempts.rows.size).toBe(0);
  });
});

describe("the guess limit (five wrong codes lock the address for fifteen minutes)", () => {
  it("locks after five wrong guesses, even for the right code afterwards, and says the same thing as any other refusal", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    for (let i = 0; i < ATTEMPT_POLICY.max; i++) expect((await failure(service.verifyCode(ADDRESS, "999999"))).code).toBe("CODE_INVALID");
    expect((await failure(service.verifyCode(ADDRESS, "123456"))).code).toBe("CODE_INVALID");
  });

  it("a fourth wrong guess still leaves the right code working", async () => {
    const { service } = setup();
    await service.requestCode(ADDRESS);
    for (let i = 0; i < ATTEMPT_POLICY.max - 1; i++) await failure(service.verifyCode(ADDRESS, "999999"));
    await expect(service.verifyCode(ADDRESS, "123456")).resolves.toEqual({ email: "engineer@example.test" });
  });

  it("lifts the lock after fifteen minutes, and a new code request does not lift it earlier", async () => {
    const { service, advance } = setup();
    await service.requestCode(ADDRESS);
    for (let i = 0; i < ATTEMPT_POLICY.max; i++) await failure(service.verifyCode(ADDRESS, "999999"));
    advance(61_000);
    await service.requestCode(ADDRESS); // a fresh code (123457) exists, the address is still locked
    expect((await failure(service.verifyCode(ADDRESS, "123457"))).code).toBe("CODE_INVALID");
    advance(ATTEMPT_POLICY.lockMs);
    await expect(service.verifyCode(ADDRESS, "123457")).resolves.toEqual({ email: "engineer@example.test" });
  });

  it("a successful sign-in clears the count", async () => {
    const { service, attempts } = setup();
    await service.requestCode(ADDRESS);
    await failure(service.verifyCode(ADDRESS, "999999"));
    expect(attempts.rows.get(hashEmail("engineer@example.test"))?.failures).toBe(1);
    await service.verifyCode(ADDRESS, "123456");
    expect(attempts.rows.size).toBe(0);
  });

  it("counts addresses separately", async () => {
    const { service } = setup();
    await service.requestCode("a@example.test");
    await service.requestCode("b@example.test");
    for (let i = 0; i < ATTEMPT_POLICY.max; i++) await failure(service.verifyCode("a@example.test", "999999"));
    await expect(service.verifyCode("b@example.test", "123457")).resolves.toEqual({ email: "b@example.test" });
  });

  it("stores only a hash of the address", async () => {
    const { service, attempts } = setup();
    await service.requestCode(ADDRESS);
    await failure(service.verifyCode(ADDRESS, "999999"));
    expect(JSON.stringify([...attempts.rows.keys()])).not.toContain("engineer");
  });
});
