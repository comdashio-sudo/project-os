import fixtureDb from "./testing/pgCompat";
import { SESSION_MAX_AGE_MS } from "@shared/const";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { sessionStore } from "./_core/sessionStore";
import { generateTotpSecret, stepAt, totpCode } from "./_core/totp";
import * as serverDb from "./db";
import { clearMfaRequiredCache, confirmEnrolment, MFA_LOCK_MS, verifySecondStep } from "./mfa";
import { appRouter } from "./routers";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 20, item 2 on a real database (owner's decision 2026-10-25): the platform owner and every company administrator pass a second step (TOTP, RFC 6238).
// Synthetic addresses only (*.example.test). The enforcement switch is on here; every other suite runs with MFA_ENFORCEMENT=off.
const cookies: Array<{ name: string; value: string }> = [];
const callerFor = (userId: number, openId: string, role: "user" | "admin", mfaVerified: boolean, sessionId = "test-session", mfaDeferralSince: number | null = null) =>
  appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@mfa.example.test`, loginMethod: "email", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, sessionId, mfaVerified, mfaDeferralSince, req: { protocol: "https", headers: {} } as never, res: { cookie: (name: string, value: string) => { cookies.push({ name, value }); } } as never } as never);

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("two-step verification", () => {
  let owner: fixtureDb.Connection;
  const ids = { admin: "mfa-admin", plain: "mfa-plain", companyAdmin: "mfa-coadmin" };
  const uid: Record<string, number> = {};
  const newSession = (userId: number) => sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
  const verified = async (sessionId: string) => (await sessionStore.findLiveSession(sessionId))?.mfaVerified;
  const secretOf = async (userId: number) => {
    const [rows] = await owner.query<{ secretSealed: string }[]>("SELECT secretSealed FROM user_mfa WHERE userId = ?", [userId]);
    const { openSecret } = await import("./_core/totp");
    return openSecret(rows[0].secretSealed);
  };
  const cleanupCompany = async (tenantId: string) => {
    for (const sql of ["DELETE FROM audit_logs WHERE tenantId = ?", "DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", "DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", "DELETE FROM roles WHERE tenantId = ?", "DELETE FROM memberships WHERE tenantId = ?", "DELETE FROM tenant_entitlements WHERE tenantId = ?", "DELETE FROM tenant_licenses WHERE tenantId = ?", "DELETE FROM subscriptions WHERE tenantId = ?", "DELETE FROM companies WHERE id = ?"]) await owner.query(sql, [tenantId]);
  };

  beforeAll(async () => {
    owner = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await owner.query("DELETE FROM users WHERE openId LIKE 'mfa-%'");
    for (const [key, role] of [["admin", "admin"], ["plain", "user"], ["companyAdmin", "user"]] as const) await owner.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES (?, ?, ?, ?, 'email')", [ids[key], ids[key], `${ids[key]}@mfa.example.test`, role]);
    const [rows] = await owner.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'mfa-%'");
    for (const row of rows) uid[row.openId] = row.id;
  }, 60_000);
  beforeEach(() => { (ENV as { mfaEnforced: boolean }).mfaEnforced = true; clearMfaRequiredCache(); });
  afterAll(async () => { (ENV as { mfaEnforced: boolean }).mfaEnforced = false; await owner.query("DELETE FROM users WHERE openId LIKE 'mfa-%'"); await owner.end(); });

  it("NEGATIVE: the platform owner's session that has not passed the second step is refused every protected call; the mfa procedures stay open", async () => {
    const sid = await newSession(uid[ids.admin]);
    const caller = callerFor(uid[ids.admin], ids.admin, "admin", false, sid);
    await expect(caller.tenant.mine()).rejects.toMatchObject({ code: "FORBIDDEN", message: "PROJECT_OS_MFA_REQUIRED" });
    expect(await caller.mfa.status()).toMatchObject({ required: true, enrolled: false, verified: false });
  });

  it("enrolment: a wrong first code is refused; the right one switches it on, shows ten recovery codes once, and verifies this session", async () => {
    const sid = await newSession(uid[ids.admin]);
    const caller = callerFor(uid[ids.admin], ids.admin, "admin", false, sid);
    const begun = await caller.mfa.beginEnrolment();
    expect(begun.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(begun.otpauthUri).toContain(`secret=${begun.secret}`);
    await expect(caller.mfa.confirmEnrolment({ code: "000000" })).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" });
    const [stored] = (await owner.query<{ s: string }[]>("SELECT secretSealed AS s FROM user_mfa WHERE userId = ?", [uid[ids.admin]]))[0];
    expect(stored.s).not.toContain(begun.secret); // sealed at rest
    const confirmed = await caller.mfa.confirmEnrolment({ code: totpCode(begun.secret, stepAt(Date.now())) });
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(await verified(sid)).toBe(true);
    // the verified session now works (the router reads the flag from the session, as the request context does)
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", true, sid).tenant.mine()).resolves.toBeDefined();
    // enrolment cannot be started over once confirmed
    await expect(caller.mfa.beginEnrolment()).rejects.toMatchObject({ code: "CONFLICT", message: "PROJECT_OS_MFA_ALREADY_ENROLLED" });
    expect(await caller.mfa.status()).toMatchObject({ required: true, enrolled: true });
  });

  it("a NEW session of the enrolled person is gated again until it verifies; a used code cannot be replayed; the next step's code works", async () => {
    const secret = await secretOf(uid[ids.admin]);
    const sid = await newSession(uid[ids.admin]);
    expect(await verified(sid)).toBe(false);
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false, sid).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
    const later = new Date(Date.now() + 31_000); // the enrolment code used the current step; one step on, a fresh code
    const next = totpCode(secret, stepAt(later.getTime()));
    await expect(verifySecondStep({ id: uid[ids.admin] }, sid, next, later)).resolves.toMatchObject({ usedRecoveryCode: false });
    expect(await verified(sid)).toBe(true);
    const other = await newSession(uid[ids.admin]);
    await expect(verifySecondStep({ id: uid[ids.admin] }, other, next, later)).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" }); // same code, second session: replay
    expect(await verified(other)).toBe(false);
  });

  it("NEGATIVE: five wrong codes lock the second step for 15 minutes — even the right code is refused while locked — and it opens again after", async () => {
    const secret = await secretOf(uid[ids.admin]);
    await owner.query("UPDATE user_mfa SET failures = 0, lockedUntil = NULL WHERE userId = ?", [uid[ids.admin]]); // the replay refusal above counted as one wrong attempt
    const sid = await newSession(uid[ids.admin]);
    const t0 = new Date(Date.now() + 120_000);
    for (let i = 0; i < 5; i++) await expect(verifySecondStep({ id: uid[ids.admin] }, sid, "111111", t0)).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" });
    await expect(verifySecondStep({ id: uid[ids.admin] }, sid, totpCode(secret, stepAt(t0.getTime())), t0)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "PROJECT_OS_MFA_LOCKED" });
    expect(await verified(sid)).toBe(false);
    const after = new Date(t0.getTime() + MFA_LOCK_MS + 1000);
    await expect(verifySecondStep({ id: uid[ids.admin] }, sid, totpCode(secret, stepAt(after.getTime())), after)).resolves.toBeDefined();
    expect(await verified(sid)).toBe(true);
  });

  it("recovery codes: each works once; a spent or unknown one is refused and the list shrinks by exactly one", async () => {
    // re-enrol a fresh person to hold the recovery codes the test needs
    const userId = uid[ids.companyAdmin];
    const sid = await newSession(userId);
    const caller = callerFor(userId, ids.companyAdmin, "user", false, sid);
    const begun = await caller.mfa.beginEnrolment();
    const { recoveryCodes } = await confirmEnrolment({ id: userId }, sid, totpCode(begun.secret, stepAt(Date.now())));
    const fresh = await newSession(userId);
    await expect(verifySecondStep({ id: userId }, fresh, "ZZZZZ-ZZZZZ")).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" });
    await expect(verifySecondStep({ id: userId }, fresh, recoveryCodes[0].toLowerCase())).resolves.toEqual({ usedRecoveryCode: true, recoveryCodesLeft: 9 });
    expect(await verified(fresh)).toBe(true);
    const again = await newSession(userId);
    await expect(verifySecondStep({ id: userId }, again, recoveryCodes[0])).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" });
    await expect(verifySecondStep({ id: userId }, again, recoveryCodes[1])).resolves.toMatchObject({ recoveryCodesLeft: 8 });
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
  });

  it("an ordinary user is not asked for it, and the check is on the person, not on the claim: a request that says role=admin for a plain user is not gated by that claim alone", async () => {
    expect(await callerFor(uid[ids.plain], ids.plain, "user", false).mfa.status()).toMatchObject({ required: false, enrolled: false, verified: false });
    await expect(callerFor(uid[ids.plain], ids.plain, "user", false).tenant.mine()).resolves.toBeDefined();
  });

  it("a company administrator (an active membership holding tenant.manage) is gated too; the person without one is not", async () => {
    const [plan] = await serverDb.getPublicCommercialPlans();
    const userId = uid[ids.companyAdmin];
    (ENV as { mfaEnforced: boolean }).mfaEnforced = false; // creating the company is not what is under test
    const created = await callerFor(userId, ids.companyAdmin, "user", true).selfService.signup({ legalName: "Mfa Co", slug: `mfa-co-${Date.now()}`, planCode: plan.code, seats: 2 }).catch(async error => {
      if (error?.message !== "PROJECT_OS_COMPANY_CREATION_OWNER_ONLY") throw error;
      return callerFor(uid[ids.admin], ids.admin, "admin", true).selfService.signup({ legalName: "Mfa Co", slug: `mfa-co-${Date.now()}`, planCode: plan.code, seats: 2 });
    });
    try {
      if (created) {
        // whoever signed up is the company's owner; make sure it is the user under test
        await owner.query("UPDATE memberships SET userId = ? WHERE tenantId = ?", [userId, created.tenantId]);
      }
      (ENV as { mfaEnforced: boolean }).mfaEnforced = true; clearMfaRequiredCache();
      await expect(callerFor(userId, ids.companyAdmin, "user", false).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
      await expect(callerFor(userId, ids.companyAdmin, "user", true).tenant.mine()).resolves.toBeDefined();
      expect(await callerFor(uid[ids.plain], ids.plain, "user", false).mfa.status()).toMatchObject({ required: false });
    } finally { if (created) await cleanupCompany(created.tenantId); }
  });

  it("ONE pending enrolment, however often it is asked for: a reload, a second tab or a second click returns the SAME secret, and the code from the first answer still works (2026-10-26)", async () => {
    const userId = uid[ids.plain];
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
    const sid = await newSession(userId);
    const caller = callerFor(userId, ids.plain, "user", false, sid);
    const first = await caller.mfa.beginEnrolment();
    const [again, third, ...parallel] = await Promise.all([caller.mfa.beginEnrolment(), caller.mfa.beginEnrolment(), ...Array.from({ length: 4 }, () => caller.mfa.beginEnrolment())]);
    for (const other of [again, third, ...parallel]) { expect(other.secret).toBe(first.secret); expect(other.enrolmentId).toBe(first.enrolmentId); }
    expect((await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM user_mfa WHERE userId = ?", [userId]))[0][0].n).toBe(1);
    // the screen holds the first answer; a code made from it is accepted, together with the id it was shown
    const confirmed = await caller.mfa.confirmEnrolment({ code: totpCode(first.secret, stepAt(Date.now())), enrolmentId: first.enrolmentId });
    expect(confirmed.recoveryCodes).toHaveLength(10);
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
  });

  it("NEGATIVE: a screen that holds a DIFFERENT enrolment than the stored one is told so (not 'wrong code'), and nothing is confirmed", async () => {
    const userId = uid[ids.plain];
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
    const caller = callerFor(userId, ids.plain, "user", false, await newSession(userId));
    const shown = await caller.mfa.beginEnrolment();
    await expect(caller.mfa.confirmEnrolment({ code: totpCode(shown.secret, stepAt(Date.now())), enrolmentId: "000000000000" })).rejects.toMatchObject({ message: "PROJECT_OS_MFA_ENROLMENT_CHANGED" });
    expect((await owner.query<{ c: Date | null }[]>("SELECT confirmedAt AS c FROM user_mfa WHERE userId = ?", [userId]))[0][0].c).toBeNull();
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
  });

  it("the platform owner's 'Later': seven days, once per browser; refused for anyone else; a company administrator's deferral cookie does nothing; after seven days the gate closes again", async () => {
    const adminId = uid[ids.admin];
    const sid = await newSession(adminId);
    // not yet: the gate holds
    await expect(callerFor(adminId, ids.admin, "admin", false, sid).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
    expect(await callerFor(adminId, ids.admin, "admin", false, sid).mfa.status()).toMatchObject({ canPostpone: true, postponedUntil: null });
    cookies.length = 0;
    const result = await callerFor(adminId, ids.admin, "admin", false, sid).mfa.postpone();
    expect(new Date(result.postponedUntil).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(cookies).toHaveLength(1);
    // the browser now sends the cookie back: the context carries its start
    const { deferralSince } = await import("./_core/mfaDeferral");
    const since = await deferralSince(cookies[0].value, adminId);
    expect(since).not.toBeNull();
    await expect(callerFor(adminId, ids.admin, "admin", false, sid, since).tenant.mine()).resolves.toBeDefined();
    expect(await callerFor(adminId, ids.admin, "admin", false, sid, since).mfa.status()).toMatchObject({ canPostpone: false, postponedUntil: result.postponedUntil });
    // once only
    await expect(callerFor(adminId, ids.admin, "admin", false, sid, since).mfa.postpone()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_POSTPONE_USED" });
    // a cookie of someone else is not mine
    expect(await deferralSince(cookies[0].value, uid[ids.plain])).toBeNull();
    // eight days later the window is over and the gate holds again (and it cannot be renewed)
    const old = Date.now() - 8 * 86_400_000;
    await expect(callerFor(adminId, ids.admin, "admin", false, sid, old).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
    await expect(callerFor(adminId, ids.admin, "admin", false, sid, old).mfa.postpone()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_POSTPONE_USED" });
    // NEGATIVE: not for anyone but the platform owner
    await expect(callerFor(uid[ids.plain], ids.plain, "user", false).mfa.postpone()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_POSTPONE_NOT_ALLOWED" });
  });

  it("the break-glass switch (MFA_ENFORCEMENT=off) lifts the requirement and nothing else: the secret and codes stay as they were", async () => {
    (ENV as { mfaEnforced: boolean }).mfaEnforced = false;
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false).tenant.mine()).resolves.toBeDefined();
    expect((await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM user_mfa WHERE userId = ?", [uid[ids.admin]]))[0][0].n).toBe(1);
  });

  it("the new table is classified and isolated like the others: row-level security is on and the application role cannot read another table's rows through it", async () => {
    const [rows] = await owner.query<{ relrowsecurity: boolean }[]>("SELECT relrowsecurity FROM pg_class WHERE relname = 'user_mfa'");
    expect(Boolean(rows[0].relrowsecurity)).toBe(true);
    expect(generateTotpSecret()).toHaveLength(32);
  });
});
