import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 18, section 0 item 6. The daily backup script run for real against the test database with the real pg_dump, gpg and pg_restore: the dump, the encryption,
// the decryption, the restore into a scratch database, the comparison of every table's count. Storage is off here (there is no bucket); the schemas are public + drizzle.
// The scratch database the script creates is dropped by the script itself. Run as the OWNER (a superuser locally and in CI), against project_os_integration_test.
const ownerUrl = process.env.TEST_DATABASE_URL;
const has = (command: string) => spawnSync(command, ["--version"]).status === 0;
const tooling = has("pg_dump") && has("pg_restore") && has("gpg");
const mustHaveTools = process.env.CI === "true"; // on CI the tools exist, so their absence is a failure, not a skip
const scripts = path.resolve(import.meta.dirname, "../scripts/backup/backup.mjs");
const folders: string[] = [];
const adminUrl = () => { const url = new URL(ownerUrl!); url.pathname = "/postgres"; return url.toString(); };

function run(extra: Record<string, string>) {
  const out = mkdtempSync(path.join(tmpdir(), "backup-test-"));
  folders.push(out);
  const result = spawnSync(process.execPath, [scripts], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", DATABASE_URL: ownerUrl!, BACKUP_RESTORE_ADMIN_URL: adminUrl(), BACKUP_ENCRYPTION_PASSPHRASE: "local-test-passphrase-not-a-secret", BACKUP_SCHEMAS: "public,drizzle", BACKUP_STORAGE: "off", BACKUP_OUT: out, ...extra },
  });
  const lines = result.stdout.trim().split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { raw: line }; } });
  return { out, status: result.status, lines, stdout: result.stdout, stderr: result.stderr };
}
afterAll(() => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); });

describe.skipIf(!isTestDatabaseUrl(ownerUrl) || (!tooling && !mustHaveTools))("daily backup on a real database (real pg_dump, gpg and pg_restore)", () => {
  it("the tools are installed where this must run", () => { if (mustHaveTools) expect(tooling).toBe(true); });

  it("dumps in one snapshot, encrypts, decrypts again, restores into a scratch database and finds EVERY table's row count equal — then leaves only encrypted files", () => {
    const result = run({});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const proof = result.lines.find(line => line.step === "restore-proof");
    expect(proof).toMatchObject({ ok: true, missing: [], different: [] });
    expect(proof.tables).toBeGreaterThan(100);
    const files = readdirSync(result.out).sort();
    expect(files).toEqual(["database.dump.gpg", "manifest.json"]);
    const manifest = JSON.parse(readFileSync(path.join(result.out, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ schemas: ["public", "drizzle"], restoreProof: { ok: true } });
    expect(manifest.files["database.dump.gpg"].bytes).toBeGreaterThan(10_000);
    // the file is encrypted: no readable SQL or table name inside it
    expect(readFileSync(path.join(result.out, "database.dump.gpg")).includes("CREATE TABLE")).toBe(false);
    expect(readFileSync(path.join(result.out, "database.dump.gpg")).includes("audit_logs")).toBe(false);
  });

  it("the right passphrase opens it and a wrong one does not", () => {
    const result = run({});
    const decrypt = (passphrase: string) => spawnSync("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--decrypt", "--output", path.join(result.out, "plain.dump"), path.join(result.out, "database.dump.gpg")], { input: passphrase, encoding: "utf8" });
    expect(decrypt("not-the-passphrase").status).not.toBe(0);
    expect(existsSync(path.join(result.out, "plain.dump")) && readFileSync(path.join(result.out, "plain.dump")).length > 0).toBe(false);
    expect(decrypt("local-test-passphrase-not-a-secret").status).toBe(0);
    expect(readFileSync(path.join(result.out, "plain.dump")).subarray(0, 5).toString()).toBe("PGDMP");
  });

  it("refuses to start without the passphrase and names it; nothing is written", () => {
    const result = run({ BACKUP_ENCRYPTION_PASSPHRASE: "" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BACKUP_ENCRYPTION_PASSPHRASE");
    expect(readdirSync(result.out)).toEqual([]);
  });

  it("refuses a dump smaller than the floor (an empty dump that exited 0 must not pass as a backup)", () => {
    const result = run({ BACKUP_MIN_DUMP_BYTES: "999999999" });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/under the floor/);
    expect(readdirSync(result.out)).toEqual([]); // no plain dump left behind either
  });

  it("a restore that cannot be done (no scratch server) is a failed run, not a quiet success", () => {
    const result = run({ BACKUP_RESTORE_ADMIN_URL: "postgres://postgres@127.0.0.1:1/postgres" });
    expect(result.status).toBe(1);
    expect(readdirSync(result.out)).not.toContain("database.dump"); // still no unencrypted copy
  });
});
