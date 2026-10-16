import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BackupKeyError, decryptBackupToFile, generateBackupKey, HEADER_LENGTH, parseBackupKey, readEncryptedBackupText, writeEncryptedBackup } from "./backupCrypto";
import { backupObjectKey, r2TargetFromEnvironment, uploadBackup } from "./exportDatabase";
import { quoteIdentifier, readDumpMarkers, sqlValue } from "./sqlDump";

const dir = mkdtempSync(join(tmpdir(), "backup-unit-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const KEY = parseBackupKey("0123456789abcdef".repeat(4));
const OTHER_KEY = parseBackupKey("fedcba9876543210".repeat(4));
const SQL = `-- demo\nINSERT INTO \`t\` VALUES ('مرحبا · ${"x".repeat(50_000)}');\n-- BACKUP COMPLETE tables=1 rows=1\n`;

async function backupFile(name: string, text = SQL) {
  const path = join(dir, name);
  await writeEncryptedBackup((async function* () { yield text.slice(0, 1000); yield text.slice(1000); })(), path, KEY);
  return path;
}

describe("SQL literals", () => {
  it("quotes and escapes every character that could end a string early or change a statement", () => {
    expect(sqlValue("plain")).toBe("'plain'");
    expect(sqlValue("it's")).toBe("'it\\'s'");
    expect(sqlValue('say "hi"')).toBe("'say \\\"hi\\\"'");
    expect(sqlValue("a\\b")).toBe("'a\\\\b'");
    expect(sqlValue("line1\nline2\r")).toBe("'line1\\nline2\\r'");
    expect(sqlValue("nul\0byte")).toBe("'nul\\0byte'");
    expect(sqlValue("ctrl\x1az")).toBe("'ctrl\\Zz'");
    expect(sqlValue("'; DROP TABLE users; --")).toBe("'\\'; DROP TABLE users; --'");
    expect(sqlValue("مرحبا 🌍")).toBe("'مرحبا 🌍'");
  });
  it("writes NULL for null, bytes as hexadecimal, and an empty string as an empty string", () => {
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(undefined)).toBe("NULL");
    expect(sqlValue(Buffer.from([0, 255, 16]))).toBe("X'00ff10'");
    expect(sqlValue(Buffer.alloc(0))).toBe("X''");
    expect(sqlValue("")).toBe("''");
  });
  it("quotes identifiers, doubling a backtick", () => { expect(quoteIdentifier("a`b")).toBe("`a``b`"); });
});

describe("dump markers", () => {
  it("reads per-table counts and the completion line, and reports a dump with no completion line as incomplete", () => {
    const whole = "-- ROWS a 3\n\n-- ROWS b 0\n\n-- BACKUP COMPLETE tables=2 rows=3\n";
    expect(readDumpMarkers(whole)).toEqual({ tables: [{ name: "a", rows: 3 }, { name: "b", rows: 0 }], complete: { tables: 2, rows: 3 } });
    expect(readDumpMarkers(whole.replace(/-- BACKUP COMPLETE.*\n/, "")).complete).toBeNull();
  });
});

describe("the key", () => {
  it("must be exactly 64 hexadecimal characters, and generated keys are", () => {
    for (const bad of [undefined, "", "short", "g".repeat(64), "a".repeat(63), "a".repeat(65)]) expect(() => parseBackupKey(bad)).toThrow(BackupKeyError);
    expect(parseBackupKey(generateBackupKey())).toHaveLength(32);
    expect(generateBackupKey()).not.toBe(generateBackupKey());
  });
  it("names the problem without printing what was given", () => {
    try { parseBackupKey("not-a-key-but-secret-looking-0123"); } catch (error) { expect((error as Error).message).not.toContain("not-a-key-but-secret-looking-0123"); }
  });
});

describe("the encrypted file", () => {
  it("round-trips a multi-chunk dump exactly, and the file does not contain the text", async () => {
    const path = await backupFile("roundtrip.enc");
    expect(await readEncryptedBackupText(path, KEY)).toBe(SQL);
    const raw = readFileSync(path);
    expect(raw.includes(Buffer.from("INSERT INTO"))).toBe(false);
    expect(raw.includes(Buffer.from("مرحبا"))).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("is a different file every time (a fresh IV), even for the same dump", async () => {
    expect(readFileSync(await backupFile("a.enc")).equals(readFileSync(await backupFile("b.enc")))).toBe(false);
  });

  it("refuses the wrong key", async () => {
    await expect(readEncryptedBackupText(await backupFile("wrongkey.enc"), OTHER_KEY)).rejects.toThrow();
  });

  it("refuses a file altered in the ciphertext, in the tag, or in the header (which is authenticated too)", async () => {
    const original = readFileSync(await backupFile("tamper-source.enc"));
    const alter = (index: number) => { const copy = Buffer.from(original); copy[index] ^= 0x01; const path = join(dir, `tampered-${index}.enc`); writeFileSync(path, copy); return path; };
    await expect(readEncryptedBackupText(alter(HEADER_LENGTH + 40), KEY)).rejects.toThrow();
    await expect(readEncryptedBackupText(alter(original.length - 1), KEY)).rejects.toThrow();
    await expect(readEncryptedBackupText(alter(HEADER_LENGTH - 1), KEY)).rejects.toThrow(); // the IV
  });

  it("refuses a truncated file and one that is not a backup at all", async () => {
    const original = readFileSync(await backupFile("trunc-source.enc"));
    for (const cut of [original.length - 1, original.length - 17, Math.floor(original.length / 2)]) {
      const path = join(dir, `cut-${cut}.enc`); writeFileSync(path, original.subarray(0, cut));
      await expect(readEncryptedBackupText(path, KEY)).rejects.toThrow();
    }
    const junk = join(dir, "junk.enc"); writeFileSync(junk, Buffer.alloc(200, 7));
    await expect(readEncryptedBackupText(junk, KEY)).rejects.toThrow(/Not a PROJECT OS backup/);
    const tiny = join(dir, "tiny.enc"); writeFileSync(tiny, Buffer.alloc(5));
    await expect(readEncryptedBackupText(tiny, KEY)).rejects.toThrow(/too short/);
  });

  it("leaves nothing that looks like a backup when decryption fails, and the plain file when it works", async () => {
    const path = await backupFile("dec-source.enc");
    const good = join(dir, "restored.sql");
    await decryptBackupToFile(path, good, KEY);
    expect(readFileSync(good, "utf8")).toBe(SQL);
    const bad = join(dir, "never.sql");
    await expect(decryptBackupToFile(path, bad, OTHER_KEY)).rejects.toThrow();
    expect(() => statSync(bad)).toThrow();
    expect(() => statSync(`${bad}.partial`)).toThrow();
  });
});

describe("storing the backup", () => {
  const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key-id", R2_SECRET_ACCESS_KEY: "secret-value-0123", R2_BUCKET: "files", BACKUP_R2_BUCKET: "" };
  it("needs every R2 value, names the ones missing, and never prints a value", () => {
    expect(() => r2TargetFromEnvironment({ ...env, R2_SECRET_ACCESS_KEY: "" })).toThrow(/R2_SECRET_ACCESS_KEY/);
    try { r2TargetFromEnvironment({ ...env, R2_ACCOUNT_ID: "", BACKUP_R2_BUCKET: "", R2_BUCKET: "" }); } catch (error) { expect((error as Error).message).toMatch(/R2_ACCOUNT_ID/); expect((error as Error).message).not.toContain("secret-value-0123"); }
  });
  it("prefers the dedicated backup bucket and falls back to the files bucket", () => {
    expect(r2TargetFromEnvironment(env).bucket).toBe("files");
    expect(r2TargetFromEnvironment({ ...env, BACKUP_R2_BUCKET: "backups-only" }).bucket).toBe("backups-only");
  });
  it("uploads under backups/<year>/<month>/ with the exact file size, to the chosen bucket", async () => {
    const path = await backupFile("upload.enc");
    const sent: Array<{ input: Record<string, unknown> }> = [];
    const result = await uploadBackup(path, r2TargetFromEnvironment({ ...env, BACKUP_R2_BUCKET: "backups-only" }), new Date("2026-10-16T01:30:00Z"), { send: async (command: { input: Record<string, unknown> }) => { sent.push(command); return {}; } } as never);
    expect(result).toEqual({ bucket: "backups-only", key: "backups/2026/10/upload.enc" });
    expect(sent).toHaveLength(1);
    expect(sent[0].input).toMatchObject({ Bucket: "backups-only", Key: "backups/2026/10/upload.enc", ContentLength: statSync(path).size });
    expect(backupObjectKey("/tmp/x/project_os-20261016T013000Z.sql.gz.enc", new Date("2026-01-02T00:00:00Z"))).toBe("backups/2026/01/project_os-20261016T013000Z.sql.gz.enc");
  });
});

describe("the command line", () => {
  const run = (args: string[], env: Record<string, string>) => spawnSync(process.execPath, ["--import", "tsx", "scripts/export-database.mjs", ...args], { cwd: join(__dirname, "..", ".."), env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8", timeout: 60_000 });

  it("fails the run (exit 3) when the upload is not configured, naming what is missing and printing no value", () => {
    const result = run(["--to-r2"], { DATABASE_URL: "mysql://user:Sup3rS3cretPassw0rd@127.0.0.1:1/x", BACKUP_ENCRYPTION_KEY: "0123456789abcdef".repeat(4) });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain("R2_ACCOUNT_ID");
    expect(result.stdout + result.stderr).not.toContain("Sup3rS3cretPassw0rd");
  });

  it("fails (exit 3) with no database, and (exit 3) with a bad key, before touching anything", () => {
    expect(run(["--out-dir", dir], { BACKUP_ENCRYPTION_KEY: "0123456789abcdef".repeat(4) }).status).toBe(3);
    expect(run(["--decrypt", join(dir, "nothing.enc")], { BACKUP_ENCRYPTION_KEY: "short" }).status).toBe(3);
  });

  it("prints a fresh key that parses, decrypts a backup to a plain file, and reports a wrong key without the file", async () => {
    const key = run(["--generate-key"], {}).stdout.trim();
    expect(() => parseBackupKey(key)).not.toThrow();
    const path = join(dir, "cli.enc");
    await writeEncryptedBackup((async function* () { yield SQL; })(), path, parseBackupKey(key));
    const out = join(dir, "cli.sql");
    expect(run(["--decrypt", path, "--out", out], { BACKUP_ENCRYPTION_KEY: key }).status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(SQL);
    const wrong = run(["--decrypt", path, "--out", join(dir, "wrong.sql")], { BACKUP_ENCRYPTION_KEY: generateBackupKey() });
    expect(wrong.status).toBe(3);
    expect(() => statSync(join(dir, "wrong.sql"))).toThrow();
  });
});
