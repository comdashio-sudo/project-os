import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareCounts, dumpIsSuspicious, majorOf, missingSecrets, tableDataEntries } from "../scripts/backup/lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(root, ".github/workflows/daily-backup.yml"), "utf8");

describe("daily backup: the decisions", () => {
  it("compares the exact row count of every table: a missing table and a different count are both a failed restore, an extra table is not", () => {
    const source = { "public.users": 10, "public.audit_logs": 4000, "auth.users": 3 };
    expect(compareCounts(source, { ...source })).toMatchObject({ ok: true, tables: 3, rows: 4013 });
    expect(compareCounts(source, { ...source, "public.users": 9 })).toMatchObject({ ok: false, different: [{ table: "public.users", source: 10, restored: 9 }] });
    const { "auth.users": _gone, ...withoutAuth } = source;
    expect(compareCounts(source, withoutAuth)).toMatchObject({ ok: false, missing: ["auth.users"] });
    expect(compareCounts(source, { ...source, "public.extra": 1 })).toMatchObject({ ok: true, extra: ["public.extra"] });
    expect(compareCounts({ "public.users": 0 }, { "public.users": "0" }).ok).toBe(true);
  });
  it("a dump under the floor, or one whose size is not a number, is not believed", () => {
    expect(dumpIsSuspicious({ bytes: 1_000, floor: 150_000 })).toBe(true);
    expect(dumpIsSuspicious({ bytes: Number.NaN, floor: 150_000 })).toBe(true);
    expect(dumpIsSuspicious({ bytes: 150_000, floor: 150_000 })).toBe(false);
  });
  it("reads the server major from server_version_num and the tables a dump will fill from pg_restore --list", () => {
    expect(majorOf("170004")).toBe(17);
    expect(majorOf("160015")).toBe(16);
    const listing = [
      "; Archive created at 2026-10-25 01:17:00 UTC",
      "215; 1259 16394 TABLE public users postgres",
      "4101; 0 16394 TABLE DATA public users postgres",
      "4102; 0 16400 TABLE DATA public audit_logs postgres",
      "4103; 0 16410 TABLE DATA auth users supabase_auth_admin",
    ].join("\n");
    expect(tableDataEntries(listing)).toEqual(["public.users", "public.audit_logs", "auth.users"]);
  });
  it("names the secrets that are missing and never looks at a value beyond present or blank", () => {
    expect(missingSecrets({ A: "x", B: "  ", C: undefined }, ["A", "B", "C", "D"])).toEqual(["B", "C", "D"]);
  });
});

describe("daily backup: the workflow", () => {
  it("runs every day and by hand, with read-only repository permission and no overlapping runs", () => {
    expect(workflow).toMatch(/schedule:\s*\n\s*- cron: "\d+ \d+ \* \* \*"/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: daily-backup\s*\n\s*cancel-in-progress: false/);
    expect(workflow).toMatch(/timeout-minutes: \d+/);
  });
  it("uses a PostgreSQL 17 client and a scratch PostgreSQL 17 (the server is 17: an older pg_dump refuses, and the proof restore must be of the same family)", () => {
    expect(workflow).toContain("postgresql-client-17");
    expect(workflow).toContain("image: postgres:17");
    expect(workflow).toContain("scripts/backup/backup.mjs");
  });
  it("stops before touching anything when a secret is missing, and names each one", () => {
    for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_PASSPHRASE"]) {
      expect(workflow, name).toContain(`secrets.${name}`);
      expect(workflow, `${name} in the refusal loop`).toMatch(new RegExp(`for name in [^\\n]*${name}`));
    }
    expect(workflow).toContain("exit 1");
  });
  it("keeps only encrypted files and the manifest, for 90 days, even when the proof turned the run red", () => {
    const upload = workflow.slice(workflow.indexOf("upload-artifact"));
    expect(upload).toMatch(/\*\.gpg/);
    expect(upload).toContain("manifest.json");
    expect(upload).not.toMatch(/\.dump\b(?!\.gpg)/);
    expect(upload).toContain("retention-days: 90");
    expect(workflow.slice(workflow.indexOf("Keep the encrypted files"), workflow.indexOf("upload-artifact"))).toContain("if: ${{ always() }}");
  });
  it("takes the database connection from the guarded step that refuses any other project", () => {
    expect(workflow).toContain("scripts/bootstrap/run.ts database");
    expect(workflow).not.toMatch(/DATABASE_URL:\s*\$\{\{/);
  });
});
