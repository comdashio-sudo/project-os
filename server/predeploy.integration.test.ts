import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUsernameFor, restrictedAccountVisibility } from "../scripts/lib/auditProtection.mjs";

// The deploy path (scripts/predeploy.mjs) against a real engine. It needs an administrative account with a TiDB-Cloud-style prefixed name
// (`prefix.root`) that may create databases and users, so it runs only when PREDEPLOY_ADMIN_URL names one (a local MySQL or TiDB); the schema it
// builds is a throwaway database that is dropped at the end.
const adminUrl = process.env.PREDEPLOY_ADMIN_URL;
describe.skipIf(!adminUrl)("predeploy: migrations, then the restricted account, then proof", () => {
  const databaseName = `predeploy_probe_${randomBytes(3).toString("hex")}`;
  const appPassword = randomBytes(12).toString("hex");
  let admin: mysql.Connection; let rootUrl = "";
  const predeploy = (env: Record<string, string | undefined>) => spawnSync(process.execPath, ["scripts/predeploy.mjs"], { encoding: "utf8", env: { ...process.env, ...env, PATH: process.env.PATH } });

  beforeAll(async () => {
    admin = await mysql.createConnection(adminUrl!);
    await admin.query(`CREATE DATABASE \`${databaseName}\``);
    const url = new URL(adminUrl!); url.pathname = `/${databaseName}`; rootUrl = url.toString();
  }, 30_000);
  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`DROP USER IF EXISTS '${appUsernameFor(adminUrl!)}'@'%'`).catch(() => undefined);
    await admin.end();
  });

  it("without the audit password it migrates and says loudly that audit_logs is not protected (the first deployment)", () => {
    const run = predeploy({ DATABASE_URL: rootUrl, PROJECT_OS_APP_DB_PASSWORD: "" });
    expect(run.status, run.stderr).toBe(0);
    expect(`${run.stdout}${run.stderr}`).toContain('"auditProtection":"OFF"');
  }, 120_000);

  it("with the password it provisions the restricted account and proves it sees every table", async () => {
    const run = predeploy({ DATABASE_URL: rootUrl, PROJECT_OS_APP_DB_PASSWORD: appPassword });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const line = run.stdout.split("\n").find(entry => entry.includes('"auditProtection":"provisioned"'))!;
    const report = JSON.parse(line);
    expect(report.tables).toBeGreaterThan(90);
    expect(report.restrictedAccountSees).toBe(report.tables);
    expect(run.stdout).toContain('"approved": true');
  }, 180_000);

  it("a table a later migration creates is INVISIBLE to the restricted account until the next predeploy grants it — and the check names it", async () => {
    await admin.query(`CREATE TABLE \`${databaseName}\`.zz_new_after_provisioning (id int PRIMARY KEY)`);
    const before = await restrictedAccountVisibility({ rootUrl, appPassword });
    expect(before.missing).toEqual(["zz_new_after_provisioning"]);
    const run = predeploy({ DATABASE_URL: rootUrl, PROJECT_OS_APP_DB_PASSWORD: appPassword });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const after = await restrictedAccountVisibility({ rootUrl, appPassword });
    expect(after.missing).toEqual([]);
    expect(after.visible).toBe(after.expected);
  }, 180_000);

  it("FAILS the deploy when the account cannot see a table (negative control: the provisioning step is made unable to grant one)", async () => {
    // a table whose name defeats the grant statement's quoting would be a contrived bug; instead take away the account's right to read one table
    // AFTER provisioning and run only the proof — the same function predeploy calls — which must report it.
    await admin.query(`REVOKE SELECT ON \`${databaseName}\`.\`zz_new_after_provisioning\` FROM '${appUsernameFor(adminUrl!)}'@'%'`);
    const seen = await restrictedAccountVisibility({ rootUrl, appPassword });
    expect(seen.missing).toContain("zz_new_after_provisioning");
  }, 60_000);

  it("a migration failure stops the deploy before any protection step is reported", () => {
    const bad = new URL(rootUrl); bad.password = "wrong-password-for-this-test";
    const run = predeploy({ DATABASE_URL: bad.toString(), PROJECT_OS_APP_DB_PASSWORD: appPassword });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain('"auditProtection":"provisioned"');
    expect(`${run.stdout}${run.stderr}`).not.toContain(appPassword);
  }, 60_000);
});
