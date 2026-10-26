import { describe, expect, it } from "vitest";
import { isReservedMailDomain, mailGateConfigFromEnv, notificationAllowance, pauseEnd, startOfUtcDay } from "./emailGate";

describe("mail gate: configuration", () => {
  it("defaults to a 100-a-day account that keeps 40 for sign-in codes, and blocks reserved domains only in production", () => {
    const config = mailGateConfigFromEnv({} as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ dailyLimit: 100, loginReserve: 40, perMinute: 20, pauseMs: 15 * 60_000, blockReservedDomains: false });
    expect(mailGateConfigFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv).blockReservedDomains).toBe(true);
    expect(mailGateConfigFromEnv({ NODE_ENV: "production", EMAIL_BLOCK_RESERVED_DOMAINS: "false" } as NodeJS.ProcessEnv).blockReservedDomains).toBe(false);
  });
  it("the owner's plan limit and reserve are read; the reserve can never swallow the whole quota", () => {
    expect(mailGateConfigFromEnv({ EMAIL_DAILY_LIMIT: "3000", EMAIL_LOGIN_RESERVE: "500" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ dailyLimit: 3000, loginReserve: 500 });
    expect(mailGateConfigFromEnv({ EMAIL_DAILY_LIMIT: "50", EMAIL_LOGIN_RESERVE: "900" } as unknown as NodeJS.ProcessEnv).loginReserve).toBe(49);
    expect(mailGateConfigFromEnv({ EMAIL_DAILY_LIMIT: "nonsense" } as unknown as NodeJS.ProcessEnv).dailyLimit).toBe(100);
  });
  it("notifications may use the day's limit minus the sign-in reserve, never below zero", () => {
    const config = mailGateConfigFromEnv({} as NodeJS.ProcessEnv);
    expect(notificationAllowance(config, 0)).toBe(60); expect(notificationAllowance(config, 59)).toBe(1); expect(notificationAllowance(config, 60)).toBe(0); expect(notificationAllowance(config, 500)).toBe(0);
  });
  it("the day is the UTC day", () => { expect(startOfUtcDay(new Date("2026-10-25T23:59:59Z")).toISOString()).toBe("2026-10-25T00:00:00.000Z"); });
});

describe("mail gate: reserved domains", () => {
  it("refuses the names that can never receive mail", () => {
    for (const address of ["a@user.test", "a@mail.example.test", "a@host.invalid", "a@pc.local", "a@box.localhost", "a@example.com", "a@sub.example.org", "a@example.net", "a@corp.internal", "no-at-sign", ""]) expect(isReservedMailDomain(address), address).toBe(true);
  });
  it("lets real domains through, including ones that merely CONTAIN a reserved word", () => {
    for (const address of ["a@company.com", "a@dashio.tasleemsa.com", "a@mytest.com", "a@example.co", "a@localtest.sa", "a@testing.org"]) expect(isReservedMailDomain(address), address).toBe(false);
  });
});

describe("mail gate: a runaway minute pauses the sending", () => {
  const config = mailGateConfigFromEnv({} as NodeJS.ProcessEnv);
  const at = (iso: string) => new Date(iso);
  const burst = (start: string, count: number, spacingMs: number) => Array.from({ length: count }, (_, index) => new Date(at(start).getTime() + index * spacingMs));
  it("20 sent within a minute pause everything for 15 minutes after the last of them", () => {
    const sent = burst("2026-10-25T10:00:00Z", 20, 2_000); // 20 in 38 s
    const end = pauseEnd(sent, at("2026-10-25T10:05:00Z"), config);
    expect(end?.toISOString()).toBe("2026-10-25T10:15:38.000Z");
  });
  it("the pause is over once its fifteen minutes have passed, and 19 in a minute never starts one", () => {
    expect(pauseEnd(burst("2026-10-25T10:00:00Z", 20, 2_000), at("2026-10-25T10:16:00Z"), config)).toBeNull();
    expect(pauseEnd(burst("2026-10-25T10:00:00Z", 19, 2_000), at("2026-10-25T10:01:00Z"), config)).toBeNull();
  });
  it("a steady trickle (20 over twenty minutes) is not a runaway", () => {
    expect(pauseEnd(burst("2026-10-25T10:00:00Z", 20, 60_000), at("2026-10-25T10:20:00Z"), config)).toBeNull();
  });
});
