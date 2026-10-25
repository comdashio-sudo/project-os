import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPECTED_PLANS, checkPlatformOwner, plantCatalog } from "../scripts/bootstrap/catalog";
import { openIdForEmail } from "./_core/auth/emailCode";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// The launch button plants the plan catalogue in production and reads back (1) how many plans exist and (2) whether OWNER_EMAIL holds the platform-administrator role.
// Run here as the database OWNER (as the button does) against the test database. Every probe row is a synthetic address (*.example.test) and is removed again.
const ownerUrl = process.env.TEST_DATABASE_URL;
let client: pg.Client;
const email = `catalog-owner-${Date.now()}@mail.example.test`;
const count = async (sql: string) => Number((await client.query(sql)).rows[0].n);

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("launch button: plan catalogue and platform owner", () => {
  beforeAll(async () => { client = new pg.Client({ connectionString: ownerUrl }); await client.connect(); });
  afterAll(async () => { await client?.query("DELETE FROM users WHERE open_id = $1", [openIdForEmail(email)]); await client?.end(); });

  it("plants the seven plans, their features and links; a second run adds nothing and reports the same totals", async () => {
    const first = await plantCatalog(client);
    expect(first.activePlans).toBeGreaterThanOrEqual(EXPECTED_PLANS);
    expect(first.features).toBeGreaterThanOrEqual(8);
    expect(first.links).toBeGreaterThan(0);
    const second = await plantCatalog(client);
    expect(second).toMatchObject({ plansPlanted: 0, featuresPlanted: 0, linksPlanted: 0, activePlans: first.activePlans, features: first.features, links: first.links });
  });

  it("creates no company data: no company, project, user or membership is added by planting", async () => {
    const tables = ["companies", "projects", "users", "memberships", "subscriptions", "tenant_licenses"];
    const before = await Promise.all(tables.map(table => count(`SELECT count(*) AS n FROM ${table}`)));
    await plantCatalog(client);
    expect(await Promise.all(tables.map(table => count(`SELECT count(*) AS n FROM ${table}`)))).toEqual(before);
  });

  it("a plan the administrator switched off stays off (re-running the button does not undo a decision)", async () => {
    await plantCatalog(client);
    await client.query("UPDATE commercial_plans SET active = false WHERE code = 'PMO_STANDARD'");
    try {
      const report = await plantCatalog(client);
      expect(report.plansPlanted).toBe(0);
      expect((await client.query("SELECT active FROM commercial_plans WHERE code = 'PMO_STANDARD'")).rows[0].active).toBe(false);
      expect(report.activePlans).toBe((await plantCatalog(client)).activePlans);
    } finally { await client.query("UPDATE commercial_plans SET active = true WHERE code = 'PMO_STANDARD'"); }
  });


  it("an EMPTY catalogue is filled by the button (the state production was found in), inside a transaction that is rolled back", async () => {
    await plantCatalog(client); // make sure it is whole first
    // plantCatalog opens its own transaction; inside this outer one its BEGIN/COMMIT/ROLLBACK become a savepoint
    const nested = { query: (sql: string, params?: unknown[]) => client.query(sql === "BEGIN" ? "SAVEPOINT planting" : sql === "COMMIT" ? "RELEASE SAVEPOINT planting" : sql === "ROLLBACK" ? "ROLLBACK TO SAVEPOINT planting" : sql, params as unknown[]) };
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM plan_feature_entitlements WHERE plan_id IN (SELECT id FROM commercial_plans WHERE code LIKE '%\\_STANDARD' AND id NOT IN (SELECT plan_id FROM tenant_licenses))");
      const removed = (await client.query("DELETE FROM commercial_plans WHERE code LIKE '%\\_STANDARD' AND id NOT IN (SELECT plan_id FROM tenant_licenses)")).rowCount ?? 0;
      expect(removed).toBeGreaterThan(0);
      const report = await plantCatalog(nested);
      expect(report.plansPlanted).toBe(removed);
      expect(report.activePlans).toBeGreaterThanOrEqual(EXPECTED_PLANS);
    } finally { await client.query("ROLLBACK"); }
    expect((await plantCatalog(client)).plansPlanted).toBe(0); // the rollback left the catalogue as it was
  });

  it("reports the owner's role by reading: no account yet, then a plain user is corrected to admin, then admin as it is", async () => {
    expect(await checkPlatformOwner(client, email)).toEqual({ state: "not_signed_in_yet", roleBefore: null });
    await client.query("INSERT INTO users (open_id, email, role, login_method) VALUES ($1, $2, 'user', 'email')", [openIdForEmail(email), email]);
    expect(await checkPlatformOwner(client, email)).toEqual({ state: "corrected", roleBefore: "user" });
    expect((await client.query("SELECT role FROM users WHERE open_id = $1", [openIdForEmail(email)])).rows[0].role).toBe("admin");
    expect(await checkPlatformOwner(client, ` ${email.toUpperCase()} `)).toEqual({ state: "admin", roleBefore: "admin" }); // the address is normalised the way sign-in does
  });

  it("touches only the owner's account: another user's role is not changed", async () => {
    const other = `catalog-other-${Date.now()}@mail.example.test`;
    await client.query("INSERT INTO users (open_id, email, role, login_method) VALUES ($1, $2, 'user', 'email')", [openIdForEmail(other), other]);
    try {
      await checkPlatformOwner(client, email);
      expect((await client.query("SELECT role FROM users WHERE open_id = $1", [openIdForEmail(other)])).rows[0].role).toBe("user");
    } finally { await client.query("DELETE FROM users WHERE open_id = $1", [openIdForEmail(other)]); }
  });
});
