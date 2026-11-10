import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { runWithDbContext } from "./_core/database";
import { createContext } from "./_core/context";
import { DB_STORAGE_MAX_FILE_BYTES, DB_STORAGE_MAX_TENANT_BYTES, registerDatabaseStorageRoutes } from "./dbStorage";
import { storageDelete, storageMode, storagePut, storageRead } from "./storage";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-79 on the test database, as the restricted application role: files live in stored_files when the S3 variables are absent. A logo and a site photo go the
// whole way through the real procedures (direct upload link, PUT, save, signed link, GET); then the limits, and isolation between two companies. Synthetic data only.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0a6a1a20000000049454e44ae426082", "hex");
const JPEG = Buffer.concat([Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex"), Buffer.alloc(64, 1), Buffer.from("ffd9", "hex")]);

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("file storage inside the database (D-79)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let server: Server; let base = ""; let owner: pg.Client;
  const asCompany = <T,>(tenantId: string, work: () => Promise<T>) => runWithDbContext({ userId: null, tenantIds: [tenantId], system: false }, work);

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "dbstore-a" }); b = await createRoleFixture({ label: "dbstore-b" });
    const app = express();
    app.use(express.json());
    registerDatabaseStorageRoutes(app);
    app.use("/api/trpc", createExpressMiddleware({ router: (await import("./routers")).appRouter, createContext }));
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise(resolve => server.close(resolve)); await owner.query("DELETE FROM stored_files WHERE tenant_id = ANY($1)", [[a.tenantId, b.tenantId]]); await owner.end(); });

  const put = (url: string, bytes: Buffer, type: string) => fetch(base + url, { method: "PUT", headers: { "Content-Type": type }, body: bytes });

  it("is the storage in use when the S3 variables are absent, with no new variable", () => {
    expect(storageMode()).toBe("database");
  });

  it("POSITIVE: a project logo and a site photo — upload link, PUT, save, then shown through the signed link", async () => {
    const asOwner = a.callerFor(a.owner);
    const logo = await asOwner.directUploads.create({ tenantId: a.tenantId, projectId: a.projectId, purpose: "logo", fileName: "logo.png", contentType: "image/png" });
    expect(logo.uploadUrl.startsWith("/api/storage/upload/")).toBe(true);
    expect((await put(logo.uploadUrl, PNG, "image/png")).status).toBe(200);
    await asOwner.projects.profile.save({ tenantId: a.tenantId, projectId: a.projectId, location: null, contractNumber: null, clientName: "Example Client Co.", consultantName: null, contractorName: null, workDays: [0, 1, 2, 3, 4], workStart: null, workEnd: null, reportPrefix: null, logos: { client: { uploadKey: logo.uploadKey } } });
    const shown = await asOwner.projects.profile.get({ tenantId: a.tenantId, projectId: a.projectId });
    const image = await fetch(base + shown.logos.client!.url!);
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(image.headers.get("content-security-policy")).toContain("sandbox");

    const site = a.callerFor(a.people.site);
    const report = await site.siteReports.save({ tenantId: a.tenantId, projectId: a.projectId, reportDate: "2026-11-01", lines: [] });
    const photo = await site.directUploads.create({ tenantId: a.tenantId, projectId: a.projectId, purpose: "sitePhoto", fileName: "site.jpg", contentType: "image/jpeg" });
    expect((await put(photo.uploadUrl, JPEG, "image/jpeg")).status).toBe(200);
    await site.siteReports.attachPhoto({ tenantId: a.tenantId, projectId: a.projectId, reportId: report.id, uploadKey: photo.uploadKey, fileName: "site.jpg" });
    const read = await site.siteReports.get({ tenantId: a.tenantId, projectId: a.projectId, reportId: report.id });
    const shot = await fetch(base + read.photos[0].url!);
    expect(shot.status).toBe(200); expect(Buffer.from(await shot.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("NEGATIVE: one company cannot read, overwrite or delete another company's file; a forged or expired link opens nothing", async () => {
    const stored = await asCompany(a.tenantId, () => storagePut(`uploads/${a.tenantId}/${a.projectId}/note/secret.txt`, "company A only", "text/plain"));
    await expect(asCompany(b.tenantId, () => storageRead(stored.key))).rejects.toThrow(/not found/);
    // a write naming A's company from B's context is refused by row-level security (an error, not a silent no-op)
    await expect(asCompany(b.tenantId, () => storagePut(`uploads/${a.tenantId}/${a.projectId}/note/forged.txt`, "from B", "text/plain"))).rejects.toThrow();
    await asCompany(b.tenantId, () => storageDelete(stored.key));
    expect((await owner.query("SELECT count(*)::int AS n FROM stored_files WHERE key = $1", [stored.key])).rows[0].n).toBe(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM stored_files WHERE tenant_id = $1 AND key LIKE '%forged%'", [a.tenantId])).rows[0].n).toBe(0);
    expect((await fetch(`${base}${stored.url}x`)).status).toBe(403); // a changed signature
    expect((await fetch(`${base}${stored.url.replace("/file/", "/upload/")}`, { method: "PUT", body: "x" })).status).toBe(403); // a read link is not an upload link
    expect(await asCompany(a.tenantId, () => storageRead(stored.key))).toEqual(Buffer.from("company A only"));
  });

  it("NEGATIVE: a file over 5 MB is refused with its message (through the link and from the server); the database CHECK refuses it too", async () => {
    const big = Buffer.alloc(DB_STORAGE_MAX_FILE_BYTES + 1, 7);
    const upload = await a.callerFor(a.owner).directUploads.create({ tenantId: a.tenantId, projectId: a.projectId, purpose: "logo", fileName: "big.png", contentType: "image/png" });
    const refused = await put(upload.uploadUrl, big, "image/png");
    expect(refused.status).toBe(413); expect(await refused.json()).toEqual({ code: "PROJECT_OS_STORAGE_FILE_TOO_LARGE" });
    await expect(asCompany(a.tenantId, () => storagePut(`uploads/${a.tenantId}/${a.projectId}/big.bin`, big))).rejects.toMatchObject({ message: "PROJECT_OS_STORAGE_FILE_TOO_LARGE" });
    await expect(owner.query("INSERT INTO stored_files (id, tenant_id, key, size, data) VALUES (gen_random_uuid()::text, $1, 'uploads/x/big', $2, $3)", [a.tenantId, big.length, big])).rejects.toThrow(/stored_files_size_check/);
  });

  it("NEGATIVE: a company cannot store more than its total; another company is not affected", async () => {
    // fill company B up to the edge with the owner connection (fixture setup, not the path under test), then one more file is refused
    const chunk = Buffer.alloc(DB_STORAGE_MAX_FILE_BYTES, 1);
    for (let i = 0; i < DB_STORAGE_MAX_TENANT_BYTES / DB_STORAGE_MAX_FILE_BYTES; i++) await owner.query("INSERT INTO stored_files (id, tenant_id, key, size, data) VALUES (gen_random_uuid()::text, $1, $2, $3, $4)", [b.tenantId, `uploads/${b.tenantId}/fill/${i}`, chunk.length, chunk]);
    await expect(asCompany(b.tenantId, () => storagePut(`uploads/${b.tenantId}/${b.projectId}/one-more.txt`, "x"))).rejects.toMatchObject({ message: "PROJECT_OS_STORAGE_QUOTA_EXCEEDED" });
    await expect(asCompany(a.tenantId, () => storagePut(`uploads/${a.tenantId}/${a.projectId}/still-fine.txt`, "x"))).resolves.toMatchObject({ key: expect.stringContaining("still-fine") });
  });

  it("no anon grant and no anon policy on the table: only the application role reads it, under row-level security", async () => {
    const { rows } = await owner.query(`SELECT c.relrowsecurity AS rls,
      (SELECT count(*)::int FROM pg_policies WHERE tablename = 'stored_files' AND ('anon' = ANY(roles) OR 'public' = ANY(roles))) AS public_policies,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS has_anon,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN has_table_privilege('anon', 'public.stored_files', 'SELECT') ELSE false END AS anon_reads,
      has_table_privilege('project_os_app', 'public.stored_files', 'SELECT') AS app_reads
      FROM pg_class c WHERE c.relname = 'stored_files'`);
    expect(rows[0]).toMatchObject({ rls: true, public_policies: 0, anon_reads: false, app_reads: true });
  });
});
