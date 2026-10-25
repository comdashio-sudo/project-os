import fixtureDb from "./testing/pgCompat";
import { SESSION_IDLE_MS, SESSION_MAX_AGE_MS } from "@shared/const";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { LAST_SEEN_REFRESH_MS, sessionStore } from "./_core/sessionStore";
import * as serverDb from "./db";
import { appRouter } from "./routers";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 20, items 7 and 5 on a real database (owner's decisions 2026-10-25): a session ends 24 hours after its last request and 14 days after it began; sign-in is by
// invitation only and only the platform owner creates companies. Synthetic addresses only (*.example.test).
const callerFor = (userId: number, openId: string, role: "user" | "admin") => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@limits.example.test`, loginMethod: "email", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as never, res: {} as never } as never);
const HOUR = 3_600_000;

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("session limits and invitation-only registration", () => {
  let owner: fixtureDb.Connection; let userId = 0; let plainId = 0; let adminId = 0;
  const ids = { user: "lim-user", plain: "lim-plain", admin: "lim-admin" };
  const seen = async (sessionId: string) => (await owner.query<{ s: Date | null }[]>("SELECT lastSeenAt AS s FROM auth_sessions WHERE id = ?", [sessionId]))[0][0]?.s ?? null;
  const backdate = (sessionId: string, createdAt: Date, lastSeenAt: Date | null) => owner.query("UPDATE auth_sessions SET createdAt = ?, lastSeenAt = ? WHERE id = ?", [createdAt, lastSeenAt, sessionId]);

  beforeAll(async () => {
    owner = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await owner.query("DELETE FROM users WHERE openId LIKE 'lim-%'");
    for (const [key, role] of [["user", "user"], ["plain", "user"], ["admin", "admin"]] as const) await owner.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES (?, ?, ?, ?, 'email')", [ids[key], ids[key], `${ids[key]}@limits.example.test`, role]);
    const [rows] = await owner.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'lim-%'");
    for (const row of rows) { if (row.openId === ids.user) userId = row.id; if (row.openId === ids.plain) plainId = row.id; if (row.openId === ids.admin) adminId = row.id; }
  }, 60_000);
  afterAll(async () => { await owner.query("DELETE FROM users WHERE openId LIKE 'lim-%'"); await owner.end(); (ENV as { registrationOpen: boolean }).registrationOpen = true; });

  describe("sessions", () => {
    it("a new session is live and carries its first 'seen' time", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
      expect(await sessionStore.findLive(id)).toBe(userId); expect(await seen(id)).toBeInstanceOf(Date);
    });
    it("NEGATIVE: a session idle for more than 24 hours is over, even though it is far from its expiry", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
      await backdate(id, new Date(Date.now() - 30 * HOUR), new Date(Date.now() - 25 * HOUR));
      expect(await sessionStore.findLive(id)).toBeNull();
    });
    it("POSITIVE: a session last seen 23 hours ago is still live, and using it marks it seen again", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
      await backdate(id, new Date(Date.now() - 30 * HOUR), new Date(Date.now() - 23 * HOUR));
      expect(await sessionStore.findLive(id)).toBe(userId);
      expect(Date.now() - (await seen(id))!.getTime()).toBeLessThan(60_000);
    });
    it("NEGATIVE: a session older than 14 days is over however busy it was (the cap is on its age, not on its activity)", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + 30 * 24 * HOUR) });
      await backdate(id, new Date(Date.now() - 15 * 24 * HOUR), new Date(Date.now() - 60_000));
      expect(await sessionStore.findLive(id)).toBeNull();
    });
    it("a session from before the column (last_seen_at null) counts from its creation", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
      await backdate(id, new Date(Date.now() - 2 * HOUR), null);
      expect(await sessionStore.findLive(id)).toBe(userId);
      await backdate(id, new Date(Date.now() - 26 * HOUR), null);
      expect(await sessionStore.findLive(id)).toBeNull();
    });
    it("a busy session does not write on every request: a 'seen' time under five minutes old is left alone", async () => {
      const id = await sessionStore.create({ userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
      const recent = new Date(Date.now() - (LAST_SEEN_REFRESH_MS - 60_000));
      await backdate(id, new Date(Date.now() - HOUR), recent);
      await sessionStore.findLive(id);
      expect((await seen(id))!.getTime()).toBe(recent.getTime());
    });
    it("the two limits are the owner's: 24 hours idle, 14 days in all", () => { expect(SESSION_IDLE_MS).toBe(24 * HOUR); expect(SESSION_MAX_AGE_MS).toBe(14 * 24 * HOUR); });
  });

  describe("invitation-only registration (REGISTRATION unset)", () => {
    const close = () => { (ENV as { registrationOpen: boolean }).registrationOpen = false; };
    it("an address with no account and no invitation may not sign in; one with an account may; the owner's address always may", async () => {
      close();
      const previous = ENV.ownerEmail; (ENV as { ownerEmail: string }).ownerEmail = "owner.lim@limits.example.test";
      try {
        expect(await serverDb.isEligibleToSignIn("Stranger.Lim@limits.example.test")).toBe(false);
        expect(await serverDb.isEligibleToSignIn("lim-user@limits.example.test")).toBe(false); // an e-mail is matched by its derived identity, not by the users.email column
        expect(await serverDb.isEligibleToSignIn("OWNER.lim@limits.example.test")).toBe(true);
      } finally { (ENV as { ownerEmail: string }).ownerEmail = previous; }
    });
    it("an address that has an account (identity derived from the address) may sign in", async () => {
      close();
      const { openIdForEmail } = await import("./_core/auth/emailCode");
      const email = "has.account.lim@limits.example.test";
      await owner.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES (?, 'x', ?, 'user', 'email')", [`lim-${openIdForEmail(email)}`.slice(4), email]);
      try { expect(await serverDb.isEligibleToSignIn(email)).toBe(true); } finally { await owner.query("DELETE FROM users WHERE email = ?", [email]); }
    });
    it("an address with a pending, unexpired invitation may sign in; an expired, revoked or accepted one may not", async () => {
      close();
      const company = await callerFor(plainId, ids.plain, "user");
      (ENV as { registrationOpen: boolean }).registrationOpen = true; // to create the company the way the test setup does
      const { tenantId } = await company.tenant.create({ legalName: "Invite Gate Co", slug: `lim-gate-${Date.now()}`, packageCode: "ALL-IN-ONE" });
      close();
      const administration = await company.tenant.administration({ tenantId });
      const role = administration.roles.find(item => item.code === "TENANT_OWNER")!;
      const email = "invited.lim@limits.example.test";
      try {
        await company.tenant.createInvitation({ tenantId, email, roleId: role.id, scopeType: "company" });
        expect(await serverDb.isEligibleToSignIn(email)).toBe(true);
        await owner.query("UPDATE membership_invitations SET expiresAt = ? WHERE email = ?", [new Date(Date.now() - HOUR), email]);
        expect(await serverDb.isEligibleToSignIn(email)).toBe(false);
        await owner.query("UPDATE membership_invitations SET expiresAt = ?, status = 'revoked' WHERE email = ?", [new Date(Date.now() + HOUR), email]);
        expect(await serverDb.isEligibleToSignIn(email)).toBe(false);
      } finally {
        await owner.query("DELETE FROM membership_invitations WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [tenantId]);
        await owner.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM roles WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM memberships WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenantId]);
        await owner.query("DELETE FROM companies WHERE id = ?", [tenantId]);
      }
    });
    it("NEGATIVE: an ordinary user cannot create a company by either door; the platform owner can; the stored role decides, not the role the request claims", async () => {
      close();
      const refuse = { code: "FORBIDDEN", message: "PROJECT_OS_COMPANY_CREATION_OWNER_ONLY" };
      await expect(callerFor(plainId, ids.plain, "user").tenant.create({ legalName: "Nope Co", slug: "lim-nope-1", packageCode: "PROJECT" })).rejects.toMatchObject(refuse);
      await expect(callerFor(plainId, ids.plain, "admin").tenant.create({ legalName: "Nope Co", slug: "lim-nope-2", packageCode: "PROJECT" })).rejects.toMatchObject(refuse); // claims admin, is not
      const [plan] = await serverDb.getPublicCommercialPlans();
      await expect(callerFor(plainId, ids.plain, "user").selfService.signup({ legalName: "Nope Co", slug: "lim-nope-3", planCode: plan.code, seats: 1 })).rejects.toMatchObject(refuse);
      const created = await callerFor(adminId, ids.admin, "admin").selfService.signup({ legalName: "Owner Made Co", slug: `lim-owner-${Date.now()}`, planCode: plan.code, seats: 2 });
      expect(created.tenantId).toMatch(/^[0-9a-f-]{36}$/);
      for (const table of ["audit_logs", "membership_roles", "role_permissions", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions"]) {
        const sql = table === "membership_roles" ? "DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?" : table === "role_permissions" ? "DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?" : `DELETE FROM ${table} WHERE tenantId = ?`;
        await owner.query(sql, [created.tenantId]);
      }
      await owner.query("DELETE FROM companies WHERE id = ?", [created.tenantId]);
    });
    it("with REGISTRATION=open the old behaviour returns: anyone may sign in and create a company (the owner's switch)", async () => {
      (ENV as { registrationOpen: boolean }).registrationOpen = true;
      expect(await serverDb.isEligibleToSignIn("anyone.lim@limits.example.test")).toBe(true);
    });
  });
});
