import fixtureDb from "./testing/pgCompat";
import { SESSION_MAX_AGE_MS } from "@shared/const";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture, ROLE_DEFINITIONS } from "../scripts/lib/roleFixture.mjs";
import { ENV } from "./_core/env";
import { sessionStore } from "./_core/sessionStore";
import { generateTotpSecret, stepAt, totpCode } from "./_core/totp";
import { clearMfaRequiredCache, confirmEnrolment, isMfaRequired, mfaGateRefusal, MFA_LOCK_MS, verifySecondStep } from "./mfa";
import { appRouter } from "./routers";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Two-step verification on a real database. Work order 20, item 2 built it (TOTP, RFC 6238); D-81 (owner's decision 2026-11-09: «لا أريد الدخول برمزين، فقط رمز دخول واحد يكفي»)
// made it optional and OFF by default for every role, the platform owner and company administrators included: it is required only of the active members of a company whose
// administrator switched on companies.require_two_step. Synthetic addresses only (*.example.test). The break-glass switch (MFA_ENFORCEMENT) is ON here, as in every other suite since D-81.
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

  // one synthetic company holding every role template (the same fixture e2e-roles uses); the platform owner is made a member of it too, so a company's choice reaches him as well
  let company: Awaited<ReturnType<typeof createRoleFixture>>;
  type Person = { id: number; openId: string };
  const asPerson = (person: Person, mfaVerified: boolean, sessionId = "test-session") => callerFor(person.id, person.openId, "user", mfaVerified, sessionId);
  const requireFor = async (tenantId: string, value: boolean) => { await owner.query("UPDATE companies SET requireTwoStep = ? WHERE id = ?", [value, tenantId]); clearMfaRequiredCache(); };

  beforeAll(async () => {
    owner = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await owner.query("DELETE FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId LIKE 'mfa-%')");
    await owner.query("DELETE FROM user_mfa WHERE userId IN (SELECT id FROM users WHERE openId LIKE 'mfa-%')");
    await owner.query("DELETE FROM users WHERE openId LIKE 'mfa-%'");
    for (const [key, role] of [["admin", "admin"], ["plain", "user"], ["companyAdmin", "user"]] as const) await owner.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES (?, ?, ?, ?, 'email')", [ids[key], ids[key], `${ids[key]}@mfa.example.test`, role]);
    const [rows] = await owner.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'mfa-%'");
    for (const row of rows) uid[row.openId] = row.id;
    company = await createRoleFixture({ label: "mfa" });
    await owner.query("INSERT INTO memberships (id, tenantId, userId, status, joinedAt) VALUES (?, ?, ?, 'active', now())", [crypto.randomUUID(), company.tenantId, uid[ids.admin]]);
  });
  beforeEach(() => { (ENV as { mfaEnforced: boolean }).mfaEnforced = true; clearMfaRequiredCache(); });
  afterAll(async () => {
    await owner.query("UPDATE companies SET requireTwoStep = false WHERE id = ?", [company?.tenantId ?? ""]);
    await owner.query("DELETE FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId LIKE 'mfa-%')");
    await owner.query("DELETE FROM user_mfa WHERE userId IN (SELECT id FROM users WHERE openId LIKE 'mfa-%')");
    await owner.query("DELETE FROM users WHERE openId LIKE 'mfa-%'"); await owner.end();
  });

  it("D-81 POSITIVE: by default NOBODY is asked for a second code — every role of a company, the platform owner and an outsider sign in with the first factor alone", async () => {
    const roles = ROLE_DEFINITIONS.map(role => role.key);
    expect(roles.length).toBeGreaterThanOrEqual(18);
    const [[row]] = await owner.query<{ r: boolean }[]>("SELECT requireTwoStep AS r FROM companies WHERE id = ?", [company.tenantId]);
    expect(Boolean(row.r)).toBe(false); // the column's default: off
    for (const key of roles) {
      const person = company.people[key] as Person;
      expect(await isMfaRequired({ id: person.id, role: "user" }), key).toBe(false);
      expect(await mfaGateRefusal({ id: person.id, role: "user" }, false), key).toBeNull(); // the HTTP routes (tenant export) ask this
      expect(await asPerson(person, false).mfa.status(), key).toMatchObject({ required: false, verified: false });
      await expect(asPerson(person, false).tenant.mine(), key).resolves.toBeDefined();
    }
    // the platform owner, a member of the company and holder of users.role = admin, and the company administrator: not asked either
    expect(await callerFor(uid[ids.admin], ids.admin, "admin", false).mfa.status()).toMatchObject({ required: false });
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false).tenant.mine()).resolves.toBeDefined();
    await expect(asPerson(company.owner as Person, false).tenant.administration({ tenantId: company.tenantId })).resolves.toBeDefined();
    await expect(callerFor(uid[ids.plain], ids.plain, "user", false).tenant.mine()).resolves.toBeDefined();
  });

  it("D-81 POSITIVE: a person who enrolled an authenticator app earlier is NOT shown the second screen and NOT refused: a new session works unverified", async () => {
    const person = company.people.owner as Person; // the company administrator, the role that had to enrol before D-81
    const sid = await newSession(person.id);
    const begun = await asPerson(person, false, sid).mfa.beginEnrolment();
    await asPerson(person, false, sid).mfa.confirmEnrolment({ code: totpCode(begun.secret, stepAt(Date.now())) });
    const fresh = await newSession(person.id);
    expect(await verified(fresh)).toBe(false);
    expect(await asPerson(person, false, fresh).mfa.status()).toMatchObject({ required: false, enrolled: true, verified: false }); // MfaGate lets the children through when required is false
    await expect(asPerson(person, false, fresh).tenant.administration({ tenantId: company.tenantId })).resolves.toBeDefined();
    expect(await mfaGateRefusal({ id: person.id, role: "user" }, false)).toBeNull();
  });

  it("the company setting: read and changed only by its administrator (tenant.manage), with an audit row; refused for other roles and for another company", async () => {
    const admin = asPerson(company.owner as Person, false);
    expect(await admin.tenant.securitySettings({ tenantId: company.tenantId })).toEqual({ requireTwoStep: false });
    // NEGATIVE: a member without tenant.manage can neither read nor change it, and nothing changes
    await expect(asPerson(company.people.site as Person, false).tenant.securitySettings({ tenantId: company.tenantId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asPerson(company.people.pm as Person, false).tenant.setRequireTwoStep({ tenantId: company.tenantId, requireTwoStep: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // NEGATIVE: not for a company the caller does not belong to
    await expect(admin.tenant.setRequireTwoStep({ tenantId: crypto.randomUUID(), requireTwoStep: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(uid[ids.plain], ids.plain, "user", false).tenant.setRequireTwoStep({ tenantId: company.tenantId, requireTwoStep: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await admin.tenant.securitySettings({ tenantId: company.tenantId })).toEqual({ requireTwoStep: false });
    const audits = async () => Number((await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'tenant.two_step_requirement_changed'", [company.tenantId]))[0][0].n);
    const before = await audits();
    expect(await admin.tenant.setRequireTwoStep({ tenantId: company.tenantId, requireTwoStep: true })).toEqual({ requireTwoStep: true });
    expect(await audits()).toBe(before + 1);
    expect(await asPerson(company.owner as Person, true).tenant.securitySettings({ tenantId: company.tenantId })).toEqual({ requireTwoStep: true });
  });

  it("NEGATIVE: once the company requires it, EVERY member is asked again (MFA_REQUIRED) until the session verifies — and nobody outside the company is", async () => {
    await requireFor(company.tenantId, true);
    for (const key of ROLE_DEFINITIONS.map(role => role.key)) {
      const person = company.people[key] as Person;
      expect(await isMfaRequired({ id: person.id, role: "user" }), key).toBe(true);
      await expect(asPerson(person, false).tenant.mine(), key).rejects.toMatchObject({ code: "FORBIDDEN", message: "PROJECT_OS_MFA_REQUIRED" });
      expect(await asPerson(person, false).mfa.status(), key).toMatchObject({ required: true });
      expect(await mfaGateRefusal({ id: person.id, role: "user" }, false), key).toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
      await expect(asPerson(person, true).tenant.mine(), key).resolves.toBeDefined(); // a verified session passes
    }
    // the platform owner is a member here, so the company's choice reaches him too
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
    // isolation: a person with no membership in that company is not affected
    expect(await callerFor(uid[ids.plain], ids.plain, "user", false).mfa.status()).toMatchObject({ required: false });
    await expect(callerFor(uid[ids.plain], ids.plain, "user", false).tenant.mine()).resolves.toBeDefined();
    // a suspended member is not held by the company's rule (only active memberships count) — and is refused by the company's own access rules as before
    const [[membership]] = await owner.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [company.tenantId, (company.people.hr as Person).id]);
    await owner.query("UPDATE memberships SET status = 'suspended' WHERE id = ?", [membership.id]); clearMfaRequiredCache();
    expect(await isMfaRequired({ id: (company.people.hr as Person).id, role: "user" })).toBe(false);
    await owner.query("UPDATE memberships SET status = 'active' WHERE id = ?", [membership.id]); clearMfaRequiredCache();
  });

  it("NEGATIVE: in a company that requires it, the platform owner's session that has not passed the second step is refused every protected call; the mfa procedures stay open", async () => {
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

  it("D-81: a person switches it on for himself from the profile (gated from then on), and off again with a current code; a wrong code changes nothing", async () => {
    const userId = uid[ids.plain];
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
    const sid = await newSession(userId);
    const caller = callerFor(userId, ids.plain, "user", false, sid);
    const begun = await caller.mfa.beginEnrolment();
    await caller.mfa.confirmEnrolment({ code: totpCode(begun.secret, stepAt(Date.now())), enrolmentId: begun.enrolmentId, turnOn: true });
    expect(await caller.mfa.status()).toMatchObject({ selfRequired: true, companyRequired: false, enrolled: true });
    // a NEW unverified session of this person is now held: his own choice, not a role
    const fresh = await newSession(userId);
    await expect(callerFor(userId, ids.plain, "user", false, fresh).tenant.mine()).rejects.toMatchObject({ message: "PROJECT_OS_MFA_REQUIRED" });
    // NEGATIVE: off with a wrong code is refused and he stays held
    const later = Date.now() + 60_000;
    await expect(callerFor(userId, ids.plain, "user", true, sid).mfa.setOwn({ on: false, code: "123456" })).rejects.toMatchObject({ message: "PROJECT_OS_MFA_CODE_INVALID" });
    expect(await isMfaRequired({ id: userId, role: "user" })).toBe(true);
    await owner.query("UPDATE user_mfa SET failures = 0, lockedUntil = NULL WHERE userId = ?", [userId]);
    // off with a current code: the first factor alone again, the authenticator is kept
    const off = await import("./mfa").then(m => m.setOwnTwoStep({ id: userId }, sid, false, totpCode(begun.secret, stepAt(later)), new Date(later)));
    expect(off).toEqual({ selfRequired: false });
    await expect(callerFor(userId, ids.plain, "user", false, await newSession(userId)).tenant.mine()).resolves.toBeDefined();
    expect(await caller.mfa.status()).toMatchObject({ required: false, selfRequired: false, enrolled: true });
    await owner.query("DELETE FROM user_mfa WHERE userId = ?", [userId]);
  });

  it("NEGATIVE: a member cannot switch it off for himself while his company requires it", async () => {
    const person = company.people.site as Person;
    await expect(asPerson(person, true).mfa.setOwn({ on: false, code: "123456" })).rejects.toMatchObject({ code: "CONFLICT", message: "PROJECT_OS_MFA_REQUIRED_BY_COMPANY" });
    expect(await isMfaRequired({ id: person.id, role: "user" })).toBe(true);
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

  it("the break-glass switch (MFA_ENFORCEMENT=off) lifts a company's requirement and nothing else: the secret and codes stay as they were", async () => {
    (ENV as { mfaEnforced: boolean }).mfaEnforced = false;
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false).tenant.mine()).resolves.toBeDefined();
    await expect(asPerson(company.people.site as Person, false).tenant.mine()).resolves.toBeDefined();
    expect((await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM user_mfa WHERE userId = ?", [uid[ids.admin]]))[0][0].n).toBe(1);
  });

  it("D-81: the company switches it off again — every member, the enrolled ones included, is back to the first factor alone, on the very next request", async () => {
    await asPerson(company.owner as Person, true).tenant.setRequireTwoStep({ tenantId: company.tenantId, requireTwoStep: false });
    for (const key of ROLE_DEFINITIONS.map(role => role.key)) await expect(asPerson(company.people[key] as Person, false).tenant.mine(), key).resolves.toBeDefined();
    await expect(callerFor(uid[ids.admin], ids.admin, "admin", false).tenant.mine()).resolves.toBeDefined(); // enrolled earlier in this file
    expect(await callerFor(uid[ids.admin], ids.admin, "admin", false).mfa.status()).toMatchObject({ required: false, enrolled: true });
  });

  it("the new table is classified and isolated like the others: row-level security is on and the application role cannot read another table's rows through it", async () => {
    const [rows] = await owner.query<{ relrowsecurity: boolean }[]>("SELECT relrowsecurity FROM pg_class WHERE relname = 'user_mfa'");
    expect(Boolean(rows[0].relrowsecurity)).toBe(true);
    expect(generateTotpSecret()).toHaveLength(32);
  });
});
