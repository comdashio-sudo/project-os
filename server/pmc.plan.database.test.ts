import { deflateSync } from "node:zlib";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

// Site plan (screen 3) on a real database. Synthetic data only.
const T = "70000000-0000-4000-8000-0000000000a1";
const T_OTHER = "70000000-0000-4000-8000-0000000000b1";
const P = "70000000-0000-4000-8000-0000000000a2";
const P_OTHER = "70000000-0000-4000-8000-0000000000b2";
const uid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [Z1, B1, G1, S1, D_WALLS, D_PAINT] = [101, 102, 103, 104, 105, 106].map(uid);
const U = [1, 2, 3, 4].map(n => uid(200 + n));
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

function png(width: number, height: number) {
  const table = Array.from({ length: 256 }, (_unused, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((width + 1) * height, 200))), chunk("IEND", Buffer.alloc(0))]);
}
const square = (x: number, y: number, size = 0.2) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const collection = (...features: Array<{ unit: unknown; coordinates: unknown }>) => JSON.stringify({ type: "FeatureCollection", features: features.map(f => ({ type: "Feature", properties: { unitNumber: f.unit }, geometry: { type: "Polygon", coordinates: [f.coordinates] } })) });

let connection: fixtureDb.Connection;
const users = { manager: 0, reader: 0, none: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  for (const table of ["pmc_site_plans", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('pmcp-manager','pmcp-reader','pmcp-none')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC site plan on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmcp-manager','Plan Manager','pmcp-manager@pmc.example.test','user'),('pmcp-reader','Plan Reader','pmcp-reader@pmc.example.test','user'),('pmcp-none','Plan None','pmcp-none@pmc.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmcp-%'");
    const idOf = (openId: string) => rows.find(r => r.openId === openId)!.id;
    users.manager = idOf("pmcp-manager"); users.reader = idOf("pmcp-reader"); users.none = idOf("pmcp-none");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Plan Tenant', 'pmc-plan'), (?, 'PMC Plan Other', 'pmc-plan-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PP-A', 'Plan project', 'villas', 'SAR', 'active'), (?, ?, 'PP-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmcp-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmcp-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmcp-ent-a', ?, 'pmcp-sub-a', 'PROJECT', true, NOW()), ('pmcp-ent-b', ?, 'pmcp-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('pmcp-perm-read','project.pmc.read','project.pmc.read','PROJECT'),('pmcp-perm-manage','project.pmc.manage','project.pmc.manage','PROJECT')");
    const [perms] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.pmc.read','project.pmc.manage')");
    const perm = (code: string) => perms.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmcp-role-manager', ?, 'PMCP_MANAGER','Manager','PROJECT'), ('pmcp-role-reader', ?, 'PMCP_READER','Reader','PROJECT'), ('pmcp-role-none', ?, 'PMCP_NONE','None','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmcp-role-manager', ?),('pmcp-role-manager', ?),('pmcp-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmcp-m-manager', ?, ?, 'active'),('pmcp-m-reader', ?, ?, 'active'),('pmcp-m-none', ?, ?, 'active')", [T, users.manager, T, users.reader, T, users.none]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmcp-mr-manager','pmcp-m-manager','pmcp-role-manager','company'),('pmcp-mr-reader','pmcp-m-reader','pmcp-role-reader','company'),('pmcp-mr-none','pmcp-m-none','pmcp-role-none','company')");
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [Z1, T, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [B1, T, P, Z1]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1), (?, ?, ?, ?, 3, 'A', 1), (?, ?, ?, ?, 4, 'A', 1)", [U[0], T, P, B1, U[1], T, P, B1, U[2], T, P, B1, U[3], T, P, B1]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'CIV', 'Civil')", [G1, T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [S1, T, P, G1]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40)", [D_WALLS, T, P, G1, S1, D_PAINT, T, P, G1, S1]);
    const cell = (n: number, unit: string, def: string, status: string) => connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status, lastChangedByUserId) VALUES (?, ?, ?, ?, ?, ?, ?)", [uid(300 + n), T, P, unit, def, status, users.manager]);
    await cell(1, U[0], D_WALLS, "COMPLETE"); await cell(2, U[1], D_WALLS, "UNDER_REVIEW"); await cell(3, U[2], D_WALLS, "IN_PROGRESS"); await cell(4, U[0], D_PAINT, "COMPLETE");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  it("stores an uploaded plan with its size, and refuses anything that is not a usable PNG or JPEG", async () => {
    const manager = callerFor(users.manager, "pmcp-manager");
    const uploaded = await manager.pmc.uploadSitePlan({ ...scope, fileName: "site plan.png", base64: png(400, 300).toString("base64") });
    expect(uploaded).toMatchObject({ widthPx: 400, heightPx: 300, mimeType: "image/png" });
    await expect(manager.pmc.uploadSitePlan({ ...scope, fileName: "x.svg", base64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>").toString("base64") })).rejects.toThrow("PROJECT_OS_PMC_PLAN_FORMAT_UNSUPPORTED");
    await expect(manager.pmc.uploadSitePlan({ ...scope, fileName: "tiny.png", base64: png(40, 40).toString("base64") })).rejects.toThrow("PROJECT_OS_PMC_PLAN_DIMENSIONS_INVALID");
    const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_site_plans WHERE tenantId = ?", [T]);
    expect(Number(rows[0].n)).toBe(1);
  }, 60_000);

  it("saves unit polygons all or nothing, and reports every wrong feature", async () => {
    const manager = callerFor(users.manager, "pmcp-manager");
    const bad = await manager.pmc.saveUnitGeometries({ ...scope, geojson: collection({ unit: 1, coordinates: square(0.1, 0.1) }, { unit: 2, coordinates: square(0.9, 0.9) }, { unit: 99, coordinates: square(0.5, 0.5) }) });
    expect(bad.saved).toBe(0);
    expect(bad.errors.map(e => [e.index, e.code])).toEqual([[1, "PMC_GEOMETRY_OUTSIDE_PLAN"]]);
    const unknown = await manager.pmc.saveUnitGeometries({ ...scope, geojson: collection({ unit: 1, coordinates: square(0.1, 0.1) }, { unit: 99, coordinates: square(0.5, 0.5) }) });
    expect(unknown).toMatchObject({ saved: 0, errors: [{ index: 1, unitNumber: 99, code: "PMC_UNIT_NOT_FOUND" }] });
    const [none] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ? AND geometryJson IS NOT NULL", [T]);
    expect(Number(none[0].n)).toBe(0);
    const good = await manager.pmc.saveUnitGeometries({ ...scope, geojson: collection({ unit: 1, coordinates: square(0.1, 0.1) }, { unit: 2, coordinates: square(0.4, 0.1) }, { unit: 3, coordinates: square(0.1, 0.5) }) });
    expect(good).toEqual({ saved: 3, errors: [] });
  }, 60_000);

  it("colours the map by the chosen activity or by overall progress, and says how many units still have no polygon", async () => {
    const reader = callerFor(users.reader, "pmcp-reader");
    const walls = await reader.pmc.siteMap({ ...scope, activityCode: "WALLS" });
    expect(walls.plan).toMatchObject({ widthPx: 400, heightPx: 300 });
    expect(walls.plan?.url).toBeTruthy();
    expect(walls.activities.map(a => a.code)).toEqual(["PAINT", "WALLS"]);
    expect(walls.units.map(u => [u.unitNumber, u.status, u.geometry !== null])).toEqual([[1, "COMPLETE", true], [2, "UNDER_REVIEW", true], [3, "IN_PROGRESS", true], [4, "NOT_STARTED", false]]);
    expect(walls.withoutPolygon).toBe(1);
    // Overall: unit 1 = WALLS 60 + PAINT 40 = 100; unit 2 under review earns 0 by default; unit 3 in progress 0; unit 4 nothing.
    const overall = await reader.pmc.siteMap(scope);
    expect(overall.units.map(u => [u.unitNumber, u.progressPercent])).toEqual([[1, 100], [2, 0], [3, 0], [4, 0]]);
  }, 60_000);

  it("opens a unit's card with every activity of its model", async () => {
    const reader = callerFor(users.reader, "pmcp-reader");
    const card = await reader.pmc.unitCard({ ...scope, unitNumber: 1 });
    expect(card).toMatchObject({ unitNumber: 1, modelCode: "A", zoneCode: "Z1", blockCode: "B1", progressPercent: 100 });
    expect(card.activities.map(a => [a.code, a.status])).toEqual([["PAINT", "COMPLETE"], ["WALLS", "COMPLETE"]]);
    await expect(reader.pmc.unitCard({ ...scope, unitNumber: 77 })).rejects.toThrow("PROJECT_OS_PMC_UNIT_NOT_FOUND");
  }, 60_000);

  it("lets a reader look but not change the plan, and closes everything to a role without the permission and to another tenant's project", async () => {
    const reader = callerFor(users.reader, "pmcp-reader");
    const none = callerFor(users.none, "pmcp-none");
    await expect(reader.pmc.uploadSitePlan({ ...scope, fileName: "p.png", base64: png(200, 200).toString("base64") })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(reader.pmc.saveUnitGeometries({ ...scope, geojson: collection({ unit: 1, coordinates: square(0.1, 0.1) }) })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(none.pmc.siteMap(scope)).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(none.pmc.unitCard({ ...scope, unitNumber: 1 })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(reader.pmc.siteMap({ tenantId: T, projectId: P_OTHER })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
  }, 60_000);
});
