import { spawnSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTestDatabaseUrl } from "./testing/testDatabase";
import { explainProvisioningFailure, setAppRoleLogin } from "../scripts/lib/appRole.mjs";

// The deploy path (scripts/predeploy.mjs) against a real PostgreSQL, on the one test database: migrations, then the restricted role, then proof.
// TEST_DATABASE_URL is the OWNER of the test database; TEST_APP_DATABASE_URL is the same database as project_os_app (its password is what the deploy
// is given as PROJECT_OS_APP_DB_PASSWORD). The migrations are already applied, so predeploy re-runs them as a no-op and re-provisions.
const ownerUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = isTestDatabaseUrl(ownerUrl) && isTestDatabaseUrl(appUrl);
const appPassword = enabled ? decodeURIComponent(new URL(appUrl!).password) : "";
const zz = "zz_predeploy_probe";

describe.skipIf(!enabled)("predeploy: migrations, then the restricted role, then proof", () => {
  let owner: pg.Client;
  const predeploy = (env: Record<string, string | undefined>) => spawnSync(process.execPath, ["scripts/predeploy.mjs"], { encoding: "utf8", env: { ...process.env, ...env, PATH: process.env.PATH } });
  const verify = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-db-security.mjs"], { encoding: "utf8", env: { ...process.env, AUDIT_APP_DATABASE_URL: appUrl } });

  beforeAll(async () => { owner = new pg.Client({ connectionString: ownerUrl }); await owner.connect(); await owner.query(`DROP TABLE IF EXISTS ${zz}`); }, 30_000);
  afterAll(async () => { await owner.query(`DROP TABLE IF EXISTS ${zz}`); await owner.end(); });

  it("without the application password it migrates and says loudly that the audit trail is not protected on the application's connection (the first deployment)", () => {
    const run = predeploy({ DATABASE_URL: ownerUrl, PROJECT_OS_APP_DB_PASSWORD: "" });
    expect(run.status, run.stderr).toBe(0);
    expect(`${run.stdout}${run.stderr}`).toContain('"auditProtection":"OFF"');
  }, 120_000);

  it("with the password it provisions the restricted role and proves it reads every table, with the audit trail append-only", () => {
    const run = predeploy({ DATABASE_URL: ownerUrl, PROJECT_OS_APP_DB_PASSWORD: appPassword });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const line = run.stdout.split("\n").find(entry => entry.includes('"auditProtection":"provisioned"'))!;
    const report = JSON.parse(line);
    expect(report.tables).toBeGreaterThan(90);
    expect(report.restrictedRoleSees).toBe(report.tables);
    expect(run.stdout).toContain('"approved": true');
    expect(run.stdout + run.stderr).not.toContain(appPassword);
  }, 180_000);

  const provision = () => spawnSync(process.execPath, ["scripts/provision-app-role.mjs"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: ownerUrl, PROJECT_OS_APP_DB_PASSWORD: appPassword } });
  const migrate = () => spawnSync(process.execPath, ["scripts/migrate.mjs"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: ownerUrl } });

  it("a table that exists without row-level security fails the proof AND the migration guard; provisioning covers it; then the proof passes", async () => {
    await owner.query(`CREATE TABLE ${zz} (id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL)`);
    const before = verify();
    expect(before.status, "a new table with no RLS yet must fail the proof").toBe(1);
    expect(JSON.parse(before.stdout).withoutRowLevelSecurity).toEqual([zz]);
    const guarded = migrate();
    expect(guarded.status).toBe(1);
    expect(guarded.stderr).toContain("have no row-level security");
    const provisioned = provision();
    expect(provisioned.status, provisioned.stderr).toBe(0);
    expect(verify().status).toBe(0);
    expect(migrate().status).toBe(0);
    // negative control: take the role's right to read it away after provisioning; the proof must name the table
    await owner.query(`REVOKE SELECT ON ${zz} FROM project_os_app`);
    const seen = verify();
    expect(seen.status).toBe(1);
    expect(JSON.parse(seen.stdout).unreadable).toEqual([zz]);
  }, 180_000);

  it("a table with no tenant_id that nobody classified stops provisioning (fail closed); it is not silently left open", async () => {
    await owner.query(`DROP TABLE IF EXISTS ${zz}`);
    await owner.query(`CREATE TABLE ${zz} (id varchar(36) PRIMARY KEY)`);
    const run = provision();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("App role provisioning failed during grant with P0001");
    expect((await owner.query("SELECT relrowsecurity FROM pg_class WHERE relname = $1", [zz])).rows[0].relrowsecurity).toBe(false);
    await owner.query(`DROP TABLE IF EXISTS ${zz}`);
    expect(provision().status).toBe(0);
  }, 180_000);

  it("a database error in the proof is reported with its stage, SQLSTATE and message, never the password (D-69: the release log said only \"error\")", () => {
    // a role that does not exist: refused at login whatever the server's authentication method (trust on a local 127.0.0.1 accepts any password)
    const wrong = new URL(appUrl!); wrong.username = "project_os_app_missing_role"; wrong.password = "wrong-password-for-this-test";
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-db-security.mjs"], { encoding: "utf8", env: { ...process.env, AUDIT_APP_DATABASE_URL: wrong.toString() } });
    expect(run.status).toBe(1);
    const report = JSON.parse(run.stderr.trim().split("\n").at(-1)!);
    expect(report).toMatchObject({ verifyDbSecurity: "ERROR", stage: "connect" });
    expect(["28000", "28P01"]).toContain(report.code);
    expect(report.message).toMatch(/project_os_app_missing_role|password authentication failed/);
    expect(run.stdout + run.stderr).not.toContain("wrong-password-for-this-test");
    expect(run.stdout + run.stderr).not.toContain(appPassword);
    // positive control, same database: the right password is approved
    expect(verify().status).toBe(0);
  }, 60_000);

  it("a migration failure stops the deploy before any protection step is reported", () => {
    const bad = new URL(ownerUrl!); bad.password = "wrong-password-for-this-test";
    const run = predeploy({ DATABASE_URL: bad.toString(), PROJECT_OS_APP_DB_PASSWORD: appPassword });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain('"auditProtection":"provisioned"');
    expect(`${run.stdout}${run.stderr}`).not.toContain(appPassword);
  }, 60_000);

  // Launch run 33: on Supabase the owner (`postgres`) is not a superuser, and PostgreSQL then refuses an ALTER ROLE that even names SUPERUSER / BYPASSRLS (42501), so
  // "set login" failed. Reproduced here with a CREATEROLE account that is not a superuser, and the fix proved with the same account.
  describe("the owner is not a superuser (Supabase)", () => {
    const provisioner = "zz_provisioner";
    const provisionerPassword = "zz-provisioner-password-16";
    let account: pg.Client;
    beforeAll(async () => {
      await owner.query(`DROP ROLE IF EXISTS ${provisioner}`).catch(() => undefined);
      await owner.query(`CREATE ROLE ${provisioner} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${provisionerPassword}'`);
      await owner.query(`GRANT project_os_app TO ${provisioner} WITH ADMIN OPTION`);
      const url = new URL(ownerUrl!); url.username = provisioner; url.password = provisionerPassword;
      account = new pg.Client({ connectionString: url.toString() }); await account.connect();
    }, 30_000);
    afterAll(async () => {
      await account?.end().catch(() => undefined);
      await owner.query("ALTER ROLE project_os_app NOCREATEDB").catch(() => undefined);
      await owner.query(`REVOKE project_os_app FROM ${provisioner}`).catch(() => undefined);
      await owner.query(`DROP ROLE IF EXISTS ${provisioner}`).catch(() => undefined);
    });

    it("the statement that failed on Supabase fails here the same way (42501), so this is the real cause", async () => {
      const error = await account.query(`ALTER ROLE project_os_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${account.escapeLiteral(appPassword)}`).then(() => null, e => e);
      expect(error?.code).toBe("42501");
    });

    it("sets login and password with only the attributes this account may name, then READS BACK that the role is exactly as restricted as before", async () => {
      expect(await setAppRoleLogin(account, appPassword)).toEqual({ ownerIsSuperuser: false });
      const { rows: [role] } = await owner.query("SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'project_os_app'");
      expect(role).toEqual({ rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolreplication: false });
    });

    it("NEGATIVE: a role that holds a power it must not have is REFUSED, by name, and the guard is not the statement but the read-back", async () => {
      await owner.query("ALTER ROLE project_os_app CREATEDB");
      const error = await setAppRoleLogin(account, appPassword).then(() => null, e => e);
      expect(error?.code).toBe("ROLE_ATTRIBUTES");
      expect(error?.excess).toEqual(["createdb"]);
      const note = explainProvisioningFailure("set login", error.code, error);
      expect(note).toContain("createdb");
      expect(note).toContain("للإلحاق فقط");
      expect(note).not.toContain(appPassword);
      await owner.query("ALTER ROLE project_os_app NOCREATEDB");
    });

    it("the owner's note names the stage and the code in Arabic for the codes a launch meets", () => {
      expect(explainProvisioningFailure("set login", "42501")).toMatch(/خطوة «set login» برمز 42501.*لا يملك صلاحية/);
      expect(explainProvisioningFailure("connect", "28P01")).toContain("SUPABASE_DB_PASSWORD");
    });
  });
});
